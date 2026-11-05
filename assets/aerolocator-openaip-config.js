/* AeroLocator · OpenAIP optional overlay configuration.
 * No API key in browser. Disabled until a server-side proxy and authorization are configured.
 * Data is informational, not an official briefing or chart.
 */
(function(root){
  'use strict';
  const SOURCE='https://www.openaip.net/';
  const LAYERS=Object.freeze([
    {id:'airspaces',label:'Espacios aéreos'},
    {id:'airports',label:'Aeródromos'},
    {id:'navaids',label:'Radioayudas'},
    {id:'reporting-points',label:'Puntos VFR'}
  ]);
  function createConfig({proxyBase='',enabled=false}={}){
    const base=String(proxyBase).trim().replace(/\/$/,'');
    const safe=base.startsWith('/')&&!base.startsWith('//')&&!base.includes('..');
    return Object.freeze({
      enabled:Boolean(enabled&&safe),
      proxyBase:safe?base:'',
      attribution:'© OpenAIP contributors · uso sujeto a licencia',
      source:SOURCE,
      layers:LAYERS,
      notice:'Información orientativa. Consultar AIP, cartas y NOTAM vigentes.'
    });
  }
  root.AeroLocatorOpenAIP=Object.freeze({createConfig,LAYERS,SOURCE});
})(typeof window!=='undefined'?window:globalThis);
