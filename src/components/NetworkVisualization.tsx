// src/components/NetworkVisualization.tsx

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import Papa from 'papaparse';
import networkData from '../assets/developer_network_countrybetweenness.csv';
import edgesData from '../assets/network_edges.csv';

interface Developer {
  developer_id: string;
  country: string;
  betweenness: number;
  in_degree: number;
  out_degree: number;
}

interface Edge {
  source: string;
  target: string;
  source_country: string;
  target_country: string;
  weight: number;
}

interface SimulationNode extends Developer {
  x: number;
  y: number;
  fx: number | null;
  fy: number | null;
}

interface SimulationLink extends Edge {
  source: SimulationNode;
  target: SimulationNode;
}

const NetworkVisualization: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [nodesResponse, edgesResponse] = await Promise.all([
          fetch(networkData),
          fetch(edgesData)
        ]);

        const [nodesText, edgesText] = await Promise.all([
          nodesResponse.text(),
          edgesResponse.text()
        ]);

        const nodes = Papa.parse<Developer>(nodesText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        }).data;

        const links = Papa.parse<Edge>(edgesText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        }).data;

        createVisualization(nodes, links);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    }

    loadData();
  }, []);

  const getCountryCode = (country: string): string => {
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
  };

  const createVisualization = (nodes: Developer[], links: Edge[]) => {
    if (!svgRef.current) return;

    const width = 1000;
    const height = 800;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height] as unknown as string);

    const container = svg.append('g');

    // Create arrow markers
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
      .domain([0, d3.max(nodes, d => d.betweenness) || 0])
      .range([8, 25]);

    const edgeWeightScale = d3.scaleLinear<number>()
      .domain([1, d3.max(links, d => d.weight) || 1])
      .range([1, 4]);

    // Create simulation
    const simulation = d3.forceSimulation<SimulationNode>(nodes as SimulationNode[])
      .force('link', d3.forceLink<SimulationNode, SimulationLink>(links as SimulationLink[])
        .id(d => d.developer_id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => betweennessScale(d.betweenness) + 5));

    // Create links
    const link = container.append('g')
      .selectAll('path')
      .data<SimulationLink>(links as SimulationLink[])
      .join('path')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => edgeWeightScale(d.weight))
      .attr('marker-end', d => `url(#arrow-${
        d.weight <= 2 ? 'small' : d.weight <= 4 ? 'medium' : 'large'
      })`);

    // Create nodes
    const node = container.append('g')
      .selectAll('.node')
      .data<SimulationNode>(nodes as SimulationNode[])
      .join('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, SimulationNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add circular backgrounds
    node.append('circle')
      .attr('r', d => betweennessScale(d.betweenness))
      .attr('fill', 'white')
      .attr('stroke', '#666')
      .attr('stroke-width', 1);

    // Add country flags
    node.append('image')
      .attr('href', d => {
        const country = d.country === 'United States' ? 'USA' : d.country;
        return `https://flagcdn.com/w40/${getCountryCode(country).toLowerCase()}.png`;
      })
      .attr('x', d => -betweennessScale(d.betweenness))
      .attr('y', d => -betweennessScale(d.betweenness))
      .attr('width', d => betweennessScale(d.betweenness) * 2)
      .attr('height', d => betweennessScale(d.betweenness) * 2)
      .attr('clip-path', 'circle(50%)')
      .on('error', function(this: SVGImageElement) {
        const parent = d3.select(this.parentNode!);
        parent.select('circle').attr('fill', '#ccc');
        d3.select(this).remove();
      });

    // Add tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('padding', '10px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000');

    node.on('mouseover', (event: MouseEvent, d: SimulationNode) => {
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

    // Update positions
    simulation.on('tick', () => {
      link.attr('d', d => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 2;
        
        if (d.source.developer_id === d.target.developer_id) {
          const x = d.source.x;
          const y = d.source.y;
          const r = betweennessScale(d.source.betweenness);
          return `M ${x-r},${y} 
                  a ${r},${r} 0 1,1 ${r*2},0 
                  a ${r},${r} 0 1,1 ${-r*2},0`;
        } else {
          return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        }
      });

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: d3.D3DragEvent<SVGGElement, SimulationNode, unknown>, d: SimulationNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, SimulationNode, unknown>, d: SimulationNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, SimulationNode, unknown>, d: SimulationNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Developer Network Visualization</h2>
      <div className="border rounded-lg p-4 bg-white shadow-lg">
        <svg ref={svgRef} className="w-full h-full" />
      </div>
      <div className="mt-4 text-sm text-gray-600 space-y-1">
        <p>• Node size represents betweenness centrality</p>
        <p>• Edge thickness shows number of interactions</p>
        <p>• Arrows indicate review direction</p>
        <p>• Hover over nodes for detailed information</p>
        <p>• Drag nodes to explore relationships</p>
        <p>• Use mouse wheel to zoom in/out</p>
      </div>
    </div>
  );
};

export default NetworkVisualization;