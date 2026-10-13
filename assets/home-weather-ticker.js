/* Gente de Vuelo - Carrusel de tiempo general por ciudad (no aeronáutico).
   Datos actuales estimados por Open-Meteo; sin Shimoda ni tokens de IA. */
(()=>{"use strict";
  const root=document.getElementById("gdv-meteo-ciudades");
  if(!root)return;
  const status=root.querySelector("#gdv-wx-state");
  const viewport=root.querySelector("#gdv-wx-viewport");
  const byTime=root.querySelector("#gdv-wx-updated");
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
    place.append(
      line("div","gdv-wx-place",city[0]),
      line("div","gdv-wx-province",city[1]),
      line("div","gdv-wx-condition",describe(weather.weather_code)),
      line("div","gdv-wx-wind","Viento "+number(weather.wind_speed_10m)+" km/h")
    );
    card.append(place,line("strong","gdv-wx-temp",number(weather.temperature_2m)+" °C"));
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
      const sample=arr.find(x=>x?.current?.time)?.current?.time;
      const when=typeof sample==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(sample)
        ?" · Datos "+sample.slice(8,10)+"/"+sample.slice(5,7)+" "+sample.slice(11,16)+" h (ARG)"
        :" · Hora de datos no disponible";
      byTime.textContent=when;
    }catch(err){
      if(!viewport.querySelector(".gdv-wx-track")){
        viewport.hidden=true;status.hidden=false;
        status.textContent="No se pudieron consultar las condiciones ahora. Volvé a intentar más tarde.";
      }else{
        byTime.textContent+=" · Actualización temporalmente no disponible";
      }
    }
  }
  refresh();
  // Se limita a dos consultas por hora y navegador, sin procesamientos de IA.
  setInterval(refresh,30*60*1000);
})();