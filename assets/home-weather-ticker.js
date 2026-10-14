/* Gente de Vuelo - Carrusel de tiempo general por ciudad (no aeronáutico).
   Datos actuales estimados por Open-Meteo; sin Shimoda ni tokens de IA. */
(()=>{"use strict";
  const root=document.getElementById("gdv-meteo-ciudades");
  if(!root)return;
  const status=root.querySelector("#gdv-wx-state");
  const viewport=root.querySelector("#gdv-wx-viewport");
  // Una ciudad representa un punto: NO se atribuye este valor a toda la provincia.
  const cities=[
    ["CABA","Ciudad de Buenos Aires",-34.6037,-58.3816],
    ["La Plata","Buenos Aires",-34.9214,-57.9545],
    ["Córdoba","Córdoba",-31.4201,-64.1888],
    ["Rosario","Santa Fe",-32.9587,-60.6939],
    ["Paraná","Entre Ríos",-31.7413,-60.5115],
    ["Mendoza","Mendoza",-32.8895,-68.8458],
    ["San Juan","San Juan",-31.5375,-68.5364],
    ["San Luis","San Luis",-33.2950,-66.3356],
    ["Salta","Salta",-24.7859,-65.4117],
    ["San Miguel de Tucumán","Tucumán",-26.8083,-65.2176],
    ["Resistencia","Chaco",-27.4514,-58.9867],
    ["Posadas","Misiones",-27.3671,-55.8961],
    ["Neuquén","Neuquén",-38.9516,-68.0591],
    ["San Carlos de Bariloche","Río Negro",-41.1335,-71.3103],
    ["Comodoro Rivadavia","Chubut",-45.8641,-67.4966],
    ["Ushuaia","Tierra del Fuego",-54.8019,-68.3030]
  ];
  const describe=(code)=>{
    if(code===0)return"Despejado";
    if(code===1)return"Mayormente despejado";
    if(code===2)return"Parcialmente nublado";
    if(code===3)return"Nublado";
    if(code===45||code===48)return"Niebla";
    if(code>=51&&code<=57)return"Llovizna";
    if(code>=61&&code<=67)return"Lluvia";
    if(code>=71&&code<=77)return"Nieve";
    if(code>=80&&code<=82)return"Chaparrones";
    if(code>=85&&code<=86)return"Nevadas";
    if(code>=95&&code<=99)return"Tormentas";
    return"Condición no identificada";
  };
  // SVG de meteorología en color, según código WMO. Sin emojis ni recursos externos.
  const sun='<circle cx="23" cy="23" r="8" fill="#ffca50" stroke="#ffe7ab" stroke-width="1.6"/>'+
    '<path d="M23 4v8m0 22v8M4 23h8m22 0h8M9.6 9.6l5.8 5.8m15.2 15.2 5.8 5.8m0-26.8-5.8 5.8m-15.2 15.2-5.8 5.8" stroke="#ffc043" stroke-width="2.6" stroke-linecap="round"/>';
  const sunBehind='<circle cx="17" cy="19" r="8" fill="#ffca50" stroke="#ffe7ab" stroke-width="1.5"/>'+
    '<path d="M17 4v6M3 19h6m-1-11 4.4 4.4m11-4.4-4.4 4.4" stroke="#ffc043" stroke-width="2.5" stroke-linecap="round"/>';
  const cloud='<path d="M14 35h22c4.3 0 7-3 7-6.6 0-3.7-2.8-6.7-6.5-7-1-5-5.3-8.6-10.4-8.6-5.8 0-10.2 4.1-10.7 9.5-3.8.2-6.4 3.3-6.4 7.1C9 32.8 11 35 14 35Z" fill="#c6d9e7" stroke="#f0f6fa" stroke-width="1.5"/>';
  const cloudBehind='<path d="M10 29h20c3.8 0 6-2.3 6-5.5 0-3.2-2.6-5.7-5.7-6-1-4.5-4.7-7.6-9.2-7.6-5 0-8.8 3.6-9.3 8.4C8 18.7 6 21 6 24c0 2.8 1.7 5 4 5Z" fill="#708fa7" stroke="#a9c4d5" stroke-width="1.5"/>';
  const rain='<path d="m17 38-2 6m12-6-2 6m12-6-2 6" stroke="#51b9fa" stroke-width="3" stroke-linecap="round"/>';
  const drizzle='<path d="m17 39-1 2.6m11-2.6-1 2.6m11-2.6-1 2.6" stroke="#72d4f2" stroke-width="2.3" stroke-linecap="round"/>';
  const snow='<path d="M17 38v8m-4-4h8m6-4v8m-4-4h8m6-4v8m-4-4h8" stroke="#9eddfb" stroke-width="1.8" stroke-linecap="round"/>';
  const fog='<path d="M8 39h32M12 44h27" stroke="#8ab8c8" stroke-width="2.6" stroke-linecap="round"/>';
  const bolt='<path d="m26 33-5 8h5l-2 6 11-13h-6l3-6" fill="#ffcc41" stroke="#ffe49c" stroke-width="1.2" stroke-linejoin="round"/>';
  const iconShape=code=>{
    if(code===0)return sun;
    if(code===1||code===2)return sunBehind+cloud;
    if(code===3)return cloudBehind+cloud;
    if(code===45||code===48)return cloud+fog;
    if(code>=51&&code<=57)return cloud+drizzle;
    if(code>=61&&code<=67)return cloud+rain;
    if(code>=71&&code<=77)return cloud+snow;
    if(code>=80&&code<=82)return cloudBehind+cloud+rain;
    if(code>=85&&code<=86)return cloudBehind+cloud+snow;
    if(code>=95&&code<=99)return cloudBehind+cloud+bolt;
    return '<circle cx="24" cy="24" r="18" fill="#53758a" stroke="#aaccdc" stroke-width="2"/>'+
      '<path d="M19 18a6 6 0 1 1 9 5c-3 1.5-4 3-4 6" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>'+
      '<circle cx="24" cy="35" r="2" fill="#fff"/>';
  };
  const weatherIcon=code=>{
    const holder=document.createElement("span");
    holder.className="gdv-wx-icon";
    holder.setAttribute("aria-hidden","true");
    holder.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false">'+iconShape(code)+'</svg>';
    return holder;
  };
  const number=value=>Math.round(value).toLocaleString("es-AR");
  const line=(tag,className,content)=>{
    const element=document.createElement(tag);
    element.className=className;
    element.textContent=content;
    return element;
  };
  function createCard(city,weather){
    const card=document.createElement("article");
    card.className="gdv-wx-card";
    const place=document.createElement("div");
    place.className="gdv-wx-info";
    place.append(
      line("div","gdv-wx-place",city[0]),
      line("div","gdv-wx-province",city[1]),
      line("div","gdv-wx-condition",describe(weather.weather_code)),
      line("div","gdv-wx-wind","Viento "+number(weather.wind_speed_10m)+" km/h")
    );
    card.append(weatherIcon(weather.weather_code),place,line("strong","gdv-wx-temp",number(weather.temperature_2m)+" °C"));
    return card;
  }
  function render(items){
    const track=document.createElement("div");track.className="gdv-wx-track";
    track.style.setProperty("--gdv-weather-speed",Math.max(78,items.length*6)+"s");
    for(let repeat=0;repeat<2;repeat++){
      const group=document.createElement("div");group.className="gdv-wx-group";
      if(repeat===1)group.setAttribute("aria-hidden","true");
      items.forEach(item=>group.append(createCard(item.city,item.weather)));
      track.append(group);
    }
    viewport.replaceChildren(track);
    status.hidden=true;
    viewport.hidden=false;
  }
  async function refresh(){
    if(document.hidden)return;
    const endpoint=new URL("https://api.open-meteo.com/v1/forecast");
    endpoint.searchParams.set("latitude",cities.map(c=>c[2]).join(","));
    endpoint.searchParams.set("longitude",cities.map(c=>c[3]).join(","));
    endpoint.searchParams.set("current","temperature_2m,weather_code,wind_speed_10m");
    endpoint.searchParams.set("timezone","America/Argentina/Buenos_Aires");
    endpoint.searchParams.set("wind_speed_unit","kmh");
    endpoint.searchParams.set("forecast_days","1");
    try{
      const response=await fetch(endpoint.toString(),{
        headers:{"Accept":"application/json"},cache:"no-store",
        signal:typeof AbortSignal.timeout==="function"?AbortSignal.timeout(15000):undefined
      });
      if(!response.ok)throw new Error("Servicio no disponible");
      const payload=await response.json();
      const arr=Array.isArray(payload)?payload:[payload];
      if(arr.length!==cities.length)throw new Error("Datos incompletos");
      const items=arr.map((item,index)=>({city:cities[index],weather:item?.current}))
        .filter(item=>item.weather&&Number.isFinite(item.weather.temperature_2m)&&
          Number.isFinite(item.weather.wind_speed_10m)&&Number.isFinite(item.weather.weather_code));
      if(items.length===0)throw new Error("Sin condiciones disponibles");
      render(items);
    }catch(err){
      if(!viewport.querySelector(".gdv-wx-track")){
        viewport.hidden=true;status.hidden=false;
        status.textContent="No se pudieron consultar las condiciones ahora. Volvé a intentar más tarde.";
      }
    }
  }
  refresh();
  // Se limita a dos consultas por hora y navegador, sin procesamientos de IA.
  setInterval(refresh,30*60*1000);
})();