/* MetroMate map explorer. Coordinates are approximate visual references, not official survey coordinates. */
(() => {
  const naranpura = [23.0575, 72.5425];
  const metro = [
    // East-West corridor: Vastral Gam to Thaltej Gam
    ['Vastral Gam',23.0008,72.6708,'red'],['Nirant Cross Road',23.0041,72.6622,'red'],['Vastral',23.0073,72.6537,'red'],['Rabari Colony',23.0104,72.6450,'red'],['Amraiwadi',23.0140,72.6362,'red'],['Apparel Park',23.0180,72.6275,'red'],['Kankaria East',23.0220,72.6179,'red'],['Kalupur Railway Station',23.0264,72.6005,'red'],['Gheekanta',23.0307,72.5885,'red'],['Shahpur',23.0354,72.5795,'red'],['Old High Court',23.0377,72.5683,'red'],['SP Stadium',23.0408,72.5610,'red'],['Commerce Six Road',23.0417,72.5540,'red'],['Gujarat University',23.0427,72.5478,'red'],['Gurukul Road',23.0441,72.5398,'red'],['Doordarshan Kendra',23.0453,72.5310,'red'],['Thaltej',23.0470,72.5210,'red'],['Thaltej Gam',23.0493,72.5123,'red'],
    // North-South corridor: APMC to Motera Stadium
    ['APMC',22.9957,72.5100,'blue'],['Jivraj Park',23.0051,72.5163,'blue'],['Rajiv Nagar',23.0140,72.5224,'blue'],['Shreyas',23.0215,72.5279,'blue'],['Paldi',23.0280,72.5326,'blue'],['Gandhigram',23.0350,72.5370,'blue'],['Usmanpura',23.0460,72.5396,'blue'],['Vijay Nagar',23.0544,72.5420,'blue'],['Vadaj',23.0648,72.5448,'blue'],['Ranip',23.0758,72.5477,'blue'],['Sabarmati Railway Station',23.0875,72.5507,'blue'],['AEC',23.0964,72.5535,'blue'],['Sabarmati',23.1050,72.5560,'blue'],['Motera Stadium',23.1132,72.5588,'blue'],
    // Phase II / Gandhinagar direction - mapped as reference corridor
    ['Koteshwar Road',23.1195,72.5632,'green'],['Vishwakarma College',23.1260,72.5684,'green'],['Tapovan Circle',23.1333,72.5740,'green'],['Narmada Canal',23.1420,72.5810,'green'],['Koba Circle',23.1514,72.5870,'green'],['Kudasan',23.1640,72.5940,'green'],['Infocity',23.1760,72.5995,'green'],['Sector 1',23.1884,72.6040,'green'],['Sector 10A',23.1980,72.6090,'green'],['Sachivalaya',23.2075,72.6140,'green'],['Akshardham',23.2160,72.6200,'green'],['Juna Sachivalaya',23.2240,72.6270,'green'],['Mahatma Mandir',23.2320,72.6330,'green']
  ].map((s,i)=>({name:s[0],lat:s[1],lng:s[2],line:s[3],type:'metro',id:'m'+i}));
  const local = [
    {name:'Naranpura Cross Road',lat:23.0585,lng:72.5448,type:'amts',detail:'Local bus stop candidate'},
    {name:'Naranpura Char Rasta',lat:23.0610,lng:72.5415,type:'amts',detail:'Local bus stop candidate'},
    {name:'A.E.C. Office',lat:23.0685,lng:72.5487,type:'amts',detail:'Local bus stop candidate'},
    {name:'Vijay Char Rasta',lat:23.0513,lng:72.5418,type:'amts',detail:'Local bus stop candidate'},
    {name:'Usmanpura Bus Stop',lat:23.0454,lng:72.5702,type:'amts',detail:'Local bus stop candidate'},
    {name:'Helmet Cross Road',lat:23.0475,lng:72.5351,type:'amts',detail:'Local bus stop candidate'},
    {name:'Sola Road Junction',lat:23.0712,lng:72.5350,type:'amts',detail:'Local bus stop candidate'},
    {name:'Gurukul Road',lat:23.0478,lng:72.5370,type:'amts',detail:'Local bus stop candidate'},
    {name:'Memnagar Bus Stop',lat:23.0448,lng:72.5310,type:'amts',detail:'Local bus stop candidate'},
    {name:'Stadium Circle',lat:23.0392,lng:72.5615,type:'amts',detail:'Local bus stop candidate'},
    {name:'Sola Cross Road BRTS',lat:23.0715,lng:72.5362,type:'brts',detail:'BRTS station candidate'},
    {name:'Shastrinagar BRTS',lat:23.0668,lng:72.5475,type:'brts',detail:'BRTS station candidate'},
    {name:'RTO Circle BRTS',lat:23.0755,lng:72.5705,type:'brts',detail:'BRTS station candidate'},
    {name:'Commerce Six Road BRTS',lat:23.0418,lng:72.5544,type:'brts',detail:'BRTS station candidate'},
    {name:'SP Stadium BRTS',lat:23.0405,lng:72.5619,type:'brts',detail:'BRTS station candidate'},
    {name:'Helmet Cross Road BRTS',lat:23.0474,lng:72.5357,type:'brts',detail:'BRTS station candidate'},
    {name:'Ranip BRTS',lat:23.0750,lng:72.5472,type:'brts',detail:'BRTS station candidate'},
    // Additional AMTS stops / interchange hubs around Ahmedabad (approximate coordinates)
    {name:'Lal Darwaja AMTS',lat:23.0258,lng:72.5824,type:'amts',detail:'AMTS interchange candidate; verify route number'},
    {name:'Kalupur Railway Station AMTS',lat:23.0267,lng:72.6010,type:'amts',detail:'AMTS interchange candidate; verify route number'},
    {name:'Sarangpur AMTS',lat:23.0187,lng:72.5914,type:'amts',detail:'AMTS interchange candidate; verify route number'},
    {name:'Maninagar Railway Station AMTS',lat:22.9967,lng:72.6031,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Paldi AMTS',lat:23.0156,lng:72.5624,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Nehru Nagar AMTS',lat:23.0150,lng:72.5465,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Shivranjani AMTS',lat:23.0236,lng:72.5292,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Iscon Cross Road AMTS',lat:23.0307,lng:72.5064,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Jivraj Park AMTS',lat:23.0051,lng:72.5163,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Vasna AMTS',lat:23.0060,lng:72.5533,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Gujarat University AMTS',lat:23.0427,lng:72.5478,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Vadaj AMTS',lat:23.0648,lng:72.5448,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Sabarmati AMTS',lat:23.0875,lng:72.5507,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Memco AMTS',lat:23.0555,lng:72.6255,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Naroda AMTS',lat:23.0710,lng:72.6530,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Civil Hospital AMTS',lat:23.0520,lng:72.6038,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Dani Limda AMTS',lat:22.9970,lng:72.5790,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Isanpur AMTS',lat:22.9820,lng:72.5910,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Hatkeshwar AMTS',lat:22.9950,lng:72.6250,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Sola Bhagwat AMTS',lat:23.0750,lng:72.5300,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Thaltej AMTS',lat:23.0470,lng:72.5210,type:'amts',detail:'AMTS stop candidate; verify route number'},
    {name:'Chandkheda AMTS',lat:23.1100,lng:72.5850,type:'amts',detail:'AMTS stop candidate; verify route number'},
    // Additional BRTS stations / corridors (approximate coordinates)
    {name:'Delhi Darwaja BRTS',lat:23.0352,lng:72.5870,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Lal Darwaja BRTS',lat:23.0258,lng:72.5824,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Astodia Darwaja BRTS',lat:23.0130,lng:72.5890,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Kankaria Lake BRTS',lat:23.0068,lng:72.6000,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Maninagar BRTS',lat:22.9968,lng:72.6030,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Nehru Nagar BRTS',lat:23.0150,lng:72.5465,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Shivranjani BRTS',lat:23.0236,lng:72.5292,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Iscon BRTS',lat:23.0307,lng:72.5064,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Jivraj Park BRTS',lat:23.0051,lng:72.5163,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Vasna BRTS',lat:23.0060,lng:72.5533,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Paldi BRTS',lat:23.0156,lng:72.5624,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Gandhigram BRTS',lat:23.0350,lng:72.5370,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Usmanpura BRTS',lat:23.0460,lng:72.5396,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Vadaj BRTS',lat:23.0648,lng:72.5448,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Sabarmati BRTS',lat:23.0875,lng:72.5507,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Chandkheda BRTS',lat:23.1050,lng:72.5680,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Narol BRTS',lat:22.9820,lng:72.5790,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Odhav BRTS',lat:23.0250,lng:72.6500,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Soni Ni Chali BRTS',lat:23.0250,lng:72.6250,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Naroda Patiya BRTS',lat:23.0520,lng:72.6250,type:'brts',detail:'BRTS station candidate; verify corridor'},
    {name:'Sabarmati Junction',lat:23.0877,lng:72.5900,type:'rail',detail:'Railway station candidate'},
    {name:'Ahmedabad Junction (Kalupur)',lat:23.0267,lng:72.6010,type:'rail',detail:'Main railway station'},
    {name:'Gandhigram',lat:23.0272,lng:72.5714,type:'rail',detail:'Railway station candidate'},
    {name:'Chandlodiya',lat:23.0806,lng:72.5310,type:'rail',detail:'Railway station candidate'},
    {name:'Ambli Road',lat:23.0297,lng:72.5023,type:'rail',detail:'Railway station candidate'},
    {name:'Asarva',lat:23.0460,lng:72.6125,type:'rail',detail:'Railway station candidate'}
  ];
  const all = [...metro,...local];
  const distanceKm=(a,b)=>{const r=6371,rad=x=>x*Math.PI/180;const dLat=rad(b[0]-a[0]),dLon=rad(b[1]-a[1]);const x=Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(x));};
  const RADIUS_KM = 10;
  local.forEach((p,i)=>{p.id=p.id||'l'+i;p.distance=distanceKm(naranpura,[p.lat,p.lng]);});
  let inRadius=local.filter(p=>p.distance<=RADIUS_KM);
  const map=L.map('map',{zoomControl:true,scrollWheelZoom:true}).setView([23.063,72.553],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  const layers={metro:L.layerGroup().addTo(map),amts:L.layerGroup().addTo(map),brts:L.layerGroup().addTo(map),rail:L.layerGroup().addTo(map)};
  const lineStyles={red:{color:'#e65467',weight:5,opacity:.9},blue:{color:'#2685d9',weight:5,opacity:.9},green:{color:'#16a085',weight:4,opacity:.85,dashArray:'8 7'}};
  ['red','blue','green'].forEach(line=>L.polyline(metro.filter(p=>p.line===line).map(p=>[p.lat,p.lng]),lineStyles[line]).addTo(layers.metro));
  const centerIcon=L.divIcon({className:'',html:'<div class="map-pin naran">N</div>',iconSize:[25,25],iconAnchor:[12,12]});
  L.marker(naranpura,{icon:centerIcon}).addTo(map).bindPopup('<b>Naranpura center</b><br>10 km straight-line radius reference');
  const radius=L.circle(naranpura,{radius:RADIUS_KM*1000,color:'#7c5ce7',weight:2,dashArray:'7 7',fillColor:'#9c8af4',fillOpacity:.07}).addTo(map);
  const markers=[];
  function iconFor(type){const letter={metro:'M',amts:'A',brts:'B',rail:'R'}[type];return L.divIcon({className:'',html:`<div class="map-pin ${type}">${letter}</div>`,iconSize:[20,20],iconAnchor:[10,10]});}
  function markerPopup(p){const d=p.distance!==undefined?`<br><span style="color:#667d82">${p.distance.toFixed(1)} km from Naranpura</span>`:'';return `<b>${p.name}</b><br>${p.type.toUpperCase()}${p.line?` · ${p.line==='red'?'Red corridor':p.line==='blue'?'Blue corridor':'Phase II reference'}`:''}${d}<br><small>${p.detail||'Approximate station location'}</small>`;}
  metro.forEach(p=>{const m=L.marker([p.lat,p.lng],{icon:iconFor('metro')}).bindPopup(markerPopup(p));m.on('click',()=>selectPoint(p));m.addTo(layers.metro);markers.push({p,m});});
  local.forEach(p=>{const m=L.marker([p.lat,p.lng],{icon:iconFor(p.type)}).bindPopup(markerPopup(p));m.on('click',()=>selectPoint(p));m.addTo(layers[p.type]);markers.push({p,m});});
  const layerChecks={metro:'layerMetro',amts:'layerAmts',brts:'layerBrts',rail:'layerRail'};
  Object.entries(layerChecks).forEach(([key,id])=>document.getElementById(id).addEventListener('change',e=>{if(e.target.checked)map.addLayer(layers[key]);else map.removeLayer(layers[key]);updateCount();}));
  document.getElementById('layerRadius').addEventListener('change',e=>{if(e.target.checked)map.addLayer(radius);else map.removeLayer(radius);});
  function updateCount(){let n=0;Object.entries(layerChecks).forEach(([k,id])=>{if(document.getElementById(id).checked)n+=k==='metro'?metro.length:all.filter(p=>p.type===k&&p.distance<=RADIUS_KM).length;});document.getElementById('visibleCount').textContent=n+' points';}
  function selectPoint(p){const d=p.distance!==undefined?`<p>${p.distance.toFixed(1)} km from Naranpura center.</p>`:'';document.getElementById('selection').innerHTML=`<div class="selection-icon">⌖</div><b>${p.name}</b><p>${p.type.toUpperCase()}${p.line?' · '+(p.line==='red'?'Red corridor':p.line==='blue'?'Blue corridor':'Phase II reference'):''}. ${p.detail||'Approximate Metro station location.'}${d}</p><button class="tool-btn" style="margin-top:10px" onclick="window.MetroMate.pick('${p.id||p.name.replace(/'/g,'')}')">Use in planner →</button>`;}
  window.MetroMate={pick(name){const found=all.find(p=>p.name===name||p.id===name);if(!found)return;const f=document.getElementById('fromPoint'),t=document.getElementById('toPoint');if(f.value===t.value||!t.value){f.value=found.id;}else{t.value=found.id;}document.getElementById('planner').scrollIntoView({behavior:'smooth'});}};
  document.getElementById('showAll').addEventListener('click',()=>{map.fitBounds(L.latLngBounds(metro.map(p=>[p.lat,p.lng])),{padding:[25,25]});document.getElementById('showAll').classList.add('selected');document.getElementById('focusNaranpura').classList.remove('selected');});
  document.getElementById('focusNaranpura').addEventListener('click',()=>{map.setView(naranpura,13);document.getElementById('focusNaranpura').classList.add('selected');document.getElementById('showAll').classList.remove('selected');});
  const lists={amts:'amtsList',brts:'brtsList',rail:'railList'};
  function renderStopLists(){
    inRadius=all.filter(p=>p.type!=='metro'&&p.distance<=RADIUS_KM);
    Object.entries(lists).forEach(([type,id])=>{const items=inRadius.filter(p=>p.type===type).sort((a,b)=>a.distance-b.distance);document.getElementById(id).innerHTML=items.map(p=>`<div class="stop-item"><span class="layer-symbol ${type}-symbol">${type==='amts'?'A':type==='brts'?'B':'R'}</span><div class="stop-main"><b>${p.name}</b><small>${p.detail||'Stop location; route/operator data may be incomplete'}</small></div><span class="distance">${p.distance.toFixed(1)} km</span><button class="view-stop" title="Show on map" data-id="${p.id}">↗</button></div>`).join('')||'<p>No mapped stops found in radius.</p>';document.getElementById(type+'Count').textContent=items.length;});
    document.querySelectorAll('.view-stop').forEach(btn=>btn.addEventListener('click',()=>{const p=all.find(x=>x.id===btn.dataset.id);if(p){map.setView([p.lat,p.lng],15);const m=markers.find(x=>x.p===p);if(m)m.m.openPopup();selectPoint(p);document.getElementById('explorer').scrollIntoView({behavior:'smooth'});}}));
    updateCount();
  }
  renderStopLists();
  const from=document.getElementById('fromPoint'),to=document.getElementById('toPoint');
  function fillPlannerOptions(keepValues=true){
    const oldFrom=keepValues?from.value:'', oldTo=keepValues?to.value:'';
    [from,to].forEach(sel=>{sel.innerHTML='';const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a place';placeholder.disabled=true;placeholder.selected=true;sel.appendChild(placeholder);});
    const seen=new Set();
    all.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(p=>{
      // Place names only in the input; metadata stays on the option for routing.
      const key=p.name.toLowerCase()+'|'+p.lat+'|'+p.lng;
      if(seen.has(key))return;seen.add(key);
      [from,to].forEach(sel=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;o.dataset.name=p.name;sel.appendChild(o);});
    });
    if(oldFrom && [...from.options].some(o=>o.value===oldFrom))from.value=oldFrom;
    if(oldTo && [...to.options].some(o=>o.value===oldTo))to.value=oldTo;
    if(!from.value)from.value=all.find(p=>p.name==='Naranpura Cross Road')?.id||all[0]?.id||'';
    if(!to.value)to.value=all.find(p=>p.name==='Ahmedabad Junction (Kalupur)')?.id||metro.find(p=>p.name==='Kalupur Railway Station')?.id||all[1]?.id||'';
  }
  fillPlannerOptions(false);
  document.getElementById('swapPoints').addEventListener('click',()=>{const x=from.value;from.value=to.value;to.value=x;});
  function fareEstimate(mode,d){const rate={metro:2.0,brts:1.6,amts:1.25,combo:2.2,rail:2.5}[mode]||1.5;return Math.max(5,Math.ceil((d*rate+5)/5)*5);}
  function timeEstimate(mode,d){const speed={metro:25,brts:17,amts:13,combo:20,rail:30}[mode]||15;return Math.max(8,Math.round(d/speed*60+(mode==='combo'?14:9)));}
  function createRequestQr(optionTitle,fare,a,b){
    const code='MM-DEMO-'+Math.random().toString(36).slice(2,8).toUpperCase();
    const request={type:'METROMATE_DEMO_JOURNEY_REQUEST',code,from:a.name,to:b.name,option:optionTitle,estimatedFareINR:fare,createdAt:new Date().toISOString(),note:'Demo request only. No payment has been made.'};
    const payload=JSON.stringify(request);
    const wrap=document.getElementById('demoRequestBox');
    wrap.hidden=false;
    document.getElementById('demoRequestCode').textContent=code;
    document.getElementById('demoRequestText').textContent=`${a.name} → ${b.name} · ${optionTitle} · estimated ₹${fare}. Demo only; no money transferred.`;
    const img=document.getElementById('demoRequestQr');
    img.src='https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data='+encodeURIComponent(payload);
    img.alt='QR code for demo journey request '+code;
    document.getElementById('downloadRequest').onclick=()=>{const blob=new Blob([JSON.stringify(request,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=code+'.json';link.click();URL.revokeObjectURL(url);};
    wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  let activeJourneyLine=null;
  document.getElementById('routeForm').addEventListener('submit',e=>{
    e.preventDefault();
    const a=all.find(p=>p.id===from.value),b=all.find(p=>p.id===to.value);
    if(!a||!b){document.getElementById('routeResults').innerHTML='<p>Please choose both a starting place and destination.</p>';return;}
    if(a.id===b.id){document.getElementById('routeResults').innerHTML='<p>Please choose two different places.</p>';return;}
    const d=distanceKm([a.lat,a.lng],[b.lat,b.lng]);
    const modes=[
      {title:'Metro',mode:'metro',desc:'Metro-first estimate; check access walking and station transfers.',tags:'METRO · WALK'},
      {title:'BRTS bus',mode:'brts',desc:'BRTS estimate; exact corridor, stop sequence and departure must be verified.',tags:'BRTS · WALK'},
      {title:'AMTS bus',mode:'amts',desc:'City-bus estimate; exact bus number and intermediate stops are not yet verified.',tags:'AMTS · WALK'},
      {title:'BRTS + Metro',mode:'combo',desc:'Combined-mode estimate; use only where a practical interchange exists.',tags:'BRTS · METRO · WALK'},
      {title:'AMTS + Metro',mode:'combo',desc:'Combined-mode estimate; use only where a practical interchange exists.',tags:'AMTS · METRO · WALK'}
    ].map((m,i)=>({...m,time:timeEstimate(m.mode,d)+(i===3?3:i===4?5:0),fare:fareEstimate(m.mode,d)+(i>=3?5:0)}));
    const fastest=[...modes].sort((x,y)=>x.time-y.time)[0],cheapest=[...modes].sort((x,y)=>x.fare-y.fare)[0];
    document.getElementById('demoRequestBox').hidden=true;
    document.getElementById('routeResults').innerHTML='<div class="route-options">'+modes.map(m=>`<article class="route-option ${m===fastest?'best':''}"><h4>${m.title}${m===fastest?' · fastest estimate':''}${m===cheapest?' · lowest fare estimate':''}</h4><div class="time">~${m.time} min</div><p><strong>Estimated fare: ₹${m.fare}</strong> per person</p><p>${m.desc}</p><div class="route-tags">${m.tags}</div><button type="button" class="button secondary request-qr" data-title="${m.title}" data-fare="${m.fare}">Create demo request QR</button></article>`).join('')+'</div><p class="route-disclaimer">Estimates are based on straight-line distance, not verified stop-to-stop routing or official fares. AMTS/BRTS route numbers and transfers must be verified before using this for a real trip.</p>';
    document.querySelectorAll('.request-qr').forEach(btn=>btn.addEventListener('click',()=>createRequestQr(btn.dataset.title,Number(btn.dataset.fare),a,b)));
    if(activeJourneyLine){map.removeLayer(activeJourneyLine);activeJourneyLine=null;}
    if(window.L&&map){activeJourneyLine=L.polyline([[a.lat,a.lng],[b.lat,b.lng]],{color:'#0b8b80',weight:4,dashArray:'7 8'}).addTo(map).bindPopup(`${a.name} → ${b.name}`).openPopup();map.fitBounds([[a.lat,a.lng],[b.lat,b.lng]],{padding:[45,45]});}
  });
  async function loadOpenStreetMapBusStops(){
    const status=document.getElementById('busDataStatus');
    try{
      status.textContent='Checking OpenStreetMap bus-stop data…';
      const response=await fetch('/api/osm-stops');
      if(!response.ok)throw new Error('Bus-stop source unavailable');
      const data=await response.json();
      if(!Array.isArray(data.stops)||!data.stops.length)throw new Error('No bus stops returned');
      const existing=new Set(all.map(p=>`${p.name.toLowerCase()}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`));
      let added=0;
      data.stops.forEach((raw,i)=>{
        const lat=Number(raw.lat),lng=Number(raw.lng),name=String(raw.name||'').trim();
        if(!name||!Number.isFinite(lat)||!Number.isFinite(lng))return;
        const distance=distanceKm(naranpura,[lat,lng]);if(distance>RADIUS_KM)return;
        const type=raw.type==='brts'?'brts':'amts';
        const key=`${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;if(existing.has(key))return;existing.add(key);
        const p={id:'osm-'+type+'-'+i+'-'+Math.round(lat*10000),name,lat,lng,type,distance,detail:raw.operatorVerified?(type==='brts'?'OpenStreetMap stop tagged for BRTS':'OpenStreetMap stop tagged for AMTS'):'OpenStreetMap bus stop; operator/route not verified'};
        all.push(p);local.push(p);const m=L.marker([lat,lng],{icon:iconFor(type)}).bindPopup(markerPopup(p));m.on('click',()=>selectPoint(p));m.addTo(layers[type]);markers.push({p,m});added++;
      });
      fillPlannerOptions(true);renderStopLists();
      status.textContent=`Loaded ${added} additional OpenStreetMap bus stops within 10 km. Coverage depends on OpenStreetMap completeness; some operators/routes may be untagged.`;
    }catch(err){status.textContent='Live bus-stop lookup unavailable. Showing the built-in sample stops; this is not a complete AMTS/BRTS list. Connect to the internet and refresh to retry.';}
  }
  loadOpenStreetMapBusStops();
  updateCount();setTimeout(()=>map.invalidateSize(),250);
})();
