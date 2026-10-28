import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ModelControls from '../src/components/ModelControls';
import '../src/styles.css';
import '../src/replica.css';
import type { Effort, Speed } from '../src/lib/catalog';

function Harness() {
 const [model,setModel]=useState('astra'),[effort,setEffort]=useState<Effort>('High'),[speed,setSpeed]=useState<Speed>(1),[real,setReal]=useState('official-first'),[reference,setReference]=useState('');
 const connected=new URLSearchParams(location.search).get('connected')==='1';
 return <div style={{position:'fixed',right:80,bottom:40}} data-selected-official={real} data-selected-reference={reference} data-selected-concept={model} data-selected-effort={effort} data-selected-speed={speed}>
  <ModelControls language="en" modelId={model} effort={effort} speed={speed} onModelChange={setModel} onEffortChange={setEffort} onSpeedChange={setSpeed} connected={connected} realModels={connected?[{id:'official-first',name:'Official first'},{id:'official-second',name:'Official second'}]:[]} realModel={real} onRealModelChange={setReal} referenceModel={reference} onReferenceSelect={setReference} onConnect={()=>{document.body.dataset.connectRequested='yes';}}/>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
