import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import Papa from 'papaparse';

const NetworkVisualization = () => {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load both data files
        const devResponse = await window.fs.readFile('developer_network_countrybetweenness.csv', { encoding: 'utf8' });
        const edgeResponse = await window.fs.readFile('network_edges.csv', { encoding: 'utf8' });

        const devData = Papa.parse(devResponse, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        }).data;

        const edgeData = Papa.parse(edgeResponse, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        }).data;

        setData({ nodes: devData, links: edgeData });
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
    const betweennessScale = d3.scaleLinear()
      .domain([0, d3.max(data.nodes, d => d.betweenness)])
      .range([8, 25]);

    const edgeWeightScale = d3.scaleLinear()
      .domain([1, d3.max(data.links, d => d.weight)])
      .range([1, 4]);

    // Create force simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links)
        .id(d => d.developer_id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => betweennessScale(d.betweenness) + 5));

    // Create links
    const links = container.append('g')
      .selectAll('path')
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
      .selectAll('.node')
      .data(data.nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag()
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
      .on('error', function() {
        const parent = d3.select(this.parentNode);
        parent.select('circle').attr('fill', '#ccc');
        this.remove();
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

    nodes.on('mouseover', (event, d) => {
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
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      links.attr('d', d => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 2;
        
        if (d.source.developer_id === d.target.developer_id) {
          // Self-loop
          const x = d.source.x;
          const y = d.source.y;
          const r = betweennessScale(d.source.betweenness);
          return `M ${x-r},${y} 
                  a ${r},${r} 0 1,1 ${r*2},0 
                  a ${r},${r} 0 1,1 ${-r*2},0`;
        } else {
          // Regular link with curve
          return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        }
      });

      nodes.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [data]);

  // Helper function to get country codes
  function getCountryCode(country) {
    const countryMap = {
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
      // Add more mappings as needed
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