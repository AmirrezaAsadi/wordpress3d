import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { SimulationNodeDatum } from 'd3';

// Define interfaces for our data structures
interface DeveloperNode extends d3.SimulationNodeDatum {
  developer_id: string;
  country: string;
  betweenness: number;
  in_degree: number;
  out_degree: number;
  x?: number;
  y?: number;
}

interface DeveloperLink extends d3.SimulationLinkDatum<DeveloperNode> {
  source: string | DeveloperNode;
  target: string | DeveloperNode;
  weight: number;
}

interface NetworkData {
  nodes: DeveloperNode[];
  links: DeveloperLink[];
}

const NetworkVisualization: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Use fetch to load CSV files
    const loadData = async () => {
      try {
        // Load both CSV files
        const [nodesResponse, linksResponse] = await Promise.all([
          fetch('/assets/developer_network_countrybetweenness.csv'),
          fetch('/assets/network_edges.csv')
        ]);

        const [nodesText, linksText] = await Promise.all([
          nodesResponse.text(),
          linksResponse.text()
        ]);

        // Parse CSV data
        const parseCSV = (csv: string) => {
          const lines = csv.split('\n');
          const headers = lines[0].split(',');
          return lines.slice(1).map(line => {
            const values = line.split(',');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return headers.reduce<Record<string, any>>((obj, header, i) => {
              obj[header.trim()] = values[i] ? 
                isNaN(Number(values[i])) ? values[i].trim() : Number(values[i]) 
                : null;
              return obj;
            }, {});
          }).filter(row => Object.values(row).some(val => val !== null));
        };

        const nodes = parseCSV(nodesText) as DeveloperNode[];
        const links = parseCSV(linksText) as DeveloperLink[];

        setData({ nodes, links });
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const width = 1000;
    const height = 800;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Create container for zoom
    const container = svg.append('g');

    // Define arrow markers for different line thicknesses
    const defs = svg.append('defs');
    
    ['small', 'medium', 'large'].forEach((size, i) => {
      defs.append('marker')
        .attr('id', `arrow-${size}`)
        .attr('viewBox', '-10 -10 20 20')
        .attr('refX', 15 + i * 2)
        .attr('refY', 0)
        .attr('markerWidth', 6 + i)
        .attr('markerHeight', 6 + i)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M-6,-6 L 0,0 L -6,6')
        .attr('fill', '#999');
    });

    // Create scales
    const betweennessScale = d3.scaleLinear<number>()
      .domain([0, d3.max(data.nodes, d => d.betweenness) || 0])
      .range([8, 25]);

    const edgeWeightScale = d3.scaleLinear<number>()
      .domain([1, d3.max(data.links, d => d.weight) || 1])
      .range([1, 4]);

    // Create force simulation
    const simulation = d3.forceSimulation<DeveloperNode>(data.nodes)
      .force('link', d3.forceLink<DeveloperNode, DeveloperLink>(data.links)
        .id(d => d.developer_id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((node: SimulationNodeDatum) => betweennessScale((node as DeveloperNode).betweenness) + 5));

    // Create links
    const links = container.append('g')
      .selectAll<SVGPathElement, DeveloperLink>('path')
      .data(data.links)
      .join('path')
      .attr('class', 'link')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => edgeWeightScale(d.weight))
      .attr('marker-end', d => `url(#arrow-${
        d.weight <= 2 ? 'small' : d.weight <= 4 ? 'medium' : 'large'
      })`);

    // Create nodes
    const nodes = container.append('g')
      .selectAll<SVGGElement, DeveloperNode>('.node')
      .data(data.nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, DeveloperNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add circular backgrounds
    nodes.append('circle')
      .attr('r', d => betweennessScale(d.betweenness))
      .attr('fill', 'white')
      .attr('stroke', '#666')
      .attr('stroke-width', 1);

    // Add country flags
    nodes.append('image')
      .attr('xlink:href', d => {
        const country = d.country === 'United States' ? 'USA' : d.country;
        return `https://flagcdn.com/w40/${getCountryCode(country).toLowerCase()}.png`;
      })
      .attr('x', d => -betweennessScale(d.betweenness))
      .attr('y', d => -betweennessScale(d.betweenness))
      .attr('width', d => betweennessScale(d.betweenness) * 2)
      .attr('height', d => betweennessScale(d.betweenness) * 2)
      .attr('clip-path', 'circle(50%)')
      .on('error', function(this: SVGImageElement) {
        const parent = d3.select(this.parentNode as SVGGElement);
        parent.select('circle').attr('fill', '#ccc');
        d3.select(this).remove();
      });

    // Add tooltips
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('padding', '8px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    nodes.on('mouseover', (event: MouseEvent, d: DeveloperNode) => {
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        tooltip.html(`
          Developer: ${d.developer_id}<br/>
          Country: ${d.country}<br/>
          Betweenness: ${d.betweenness.toFixed(4)}<br/>
          In-degree: ${d.in_degree}<br/>
          Out-degree: ${d.out_degree}
        `)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 28}px`);
      })
      .on('mouseout', () => {
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      });

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        container.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      links.attr('d', d => {
        const source = d.source as DeveloperNode;
        const target = d.target as DeveloperNode;
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dr = Math.sqrt(dx * dx + dy * dy) * 2;
        
        if (source.developer_id === target.developer_id) {
          // Self-loop
          const x = source.x!;
          const y = source.y!;
          const r = betweennessScale(source.betweenness);
          return `M ${x-r},${y} 
                  a ${r},${r} 0 1,1 ${r*2},0 
                  a ${r},${r} 0 1,1 ${-r*2},0`;
        } else {
          // Regular link with curve
          return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
        }
      });

      nodes.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: d3.D3DragEvent<SVGGElement, DeveloperNode, unknown>, d: DeveloperNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, DeveloperNode, unknown>, d: DeveloperNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, DeveloperNode, unknown>, d: DeveloperNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [data]);

  // Helper function to get country codes
  function getCountryCode(country: string): string {
    const countryMap: Record<string, string> = {
      'USA': 'US',
      'United States': 'US',
      'United Kingdom': 'GB',
      'Germany': 'DE',
      'France': 'FR',
      'Spain': 'ES',
      'Italy': 'IT',
      'Netherlands': 'NL',
      'Belgium': 'BE',
      'Switzerland': 'CH',
      'Austria': 'AT',
      'Canada': 'CA',
      'Australia': 'AU',
      'India': 'IN',
      'Unknown': 'UN'
    };
    return countryMap[country] || 'UN';
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Developer Network Visualization</h2>
      <div className="border rounded-lg p-4 bg-white">
        {loading ? (
          <div>Loading visualization...</div>
        ) : (
          <svg ref={svgRef} className="w-full h-full" />
        )}
      </div>
      <div className="mt-4 text-sm text-gray-600">
        <p>• Node size represents betweenness centrality</p>
        <p>• Edge thickness shows number of interactions</p>
        <p>• Arrows indicate review direction</p>
        <p>• Hover over nodes for detailed information</p>
      </div>
    </div>
  );
};

export default NetworkVisualization;