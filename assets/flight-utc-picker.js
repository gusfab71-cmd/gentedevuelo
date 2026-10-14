/* Mesa de Vuelo: calendario UTC en grises azulados; entrada nativa si Flatpickr no carga. */
(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    const input=document.getElementById('flight-time');
    if(!input||typeof window.flatpickr!=='function')return;
    const previous=input.value;
    input.type='text';
    if(previous)input.value=previous.replace('T',' ');
    const picker=window.flatpickr(input,{
      enableTime:true,time_24hr:true,
      dateFormat:'Y-m-d H:i',
      altInput:true,altFormat:'d/m/Y H:i',
      locale:window.flatpickr.l10ns?.es||'default',
      minuteIncrement:1,disableMobile:true,allowInput:false,
      onReady:(_dates,_text,instance)=>{
        instance.calendarContainer.classList.add('gdv-utc-calendar');
        const display=instance.altInput;
        if(!display)return;
        display.classList.add('flight-time-display');
        display.id='flight-time-display';
        display.placeholder='Seleccioná fecha y hora UTC';
        display.setAttribute('aria-label','Fecha y hora previstas de salida UTC');
        display.setAttribute('aria-describedby','flight-time-help');
        display.setAttribute('autocomplete','off');
        display.required=true;
        display.setAttribute('aria-required','true');
        const label=document.querySelector('label.flight-utc-field');
        if(label)label.htmlFor='flight-time-display';
      }
    });
    window.gdvUtcPicker=picker;
  });
})();
