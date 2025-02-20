import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import networkData from '../assets/developer_network_countrybetweenness.csv';
import edgesData from '../assets/network_edges.csv';

const NetworkVisualization = () => {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Since the CSV is already imported, we can use it directly
    const processData = () => {
      try {
        // The imported CSV files should already be parsed into JSON
        setData({ 
          nodes: networkData, 
          links: edgesData 
        });
        setLoading(false);
      } catch (error) {
        console.error('Error processing data:', error);
      }
    };

    processData();
  }, []);

  // Rest of your code remains the same, starting from the second useEffect...
  useEffect(() => {
    if (!data || !svgRef.current) return;

    const width = 1000;
    const height = 800;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    // ... [rest of your visualization code remains exactly the same]
  }, [data]);

  // Helper function getCountryCode remains the same...
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