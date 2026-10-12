'use strict';
/* Selector liviano de emojis básicos para las dos salas de AeroChat. */
(() => {
  const emojis = [
    ['😀', 'Sonrisa'], ['😁', 'Sonrisa grande'], ['😂', 'Risa'],
    ['😊', 'Contento'], ['😍', 'Enamorado'], ['😘', 'Beso'],
    ['😉', 'Guiño'], ['😎', 'Genial'], ['🤔', 'Pensando'],
    ['😅', 'Alivio'], ['😮', 'Sorpresa'], ['😢', 'Triste'],
    ['😭', 'Llanto'], ['😡', 'Enojo'], ['👍', 'Me gusta'],
    ['👎', 'No me gusta'], ['👏', 'Aplausos'], ['🙏', 'Gracias'],
    ['❤️', 'Corazón'], ['💙', 'Corazón azul'], ['👌', 'Perfecto'],
    ['🤝', 'Acuerdo'], ['🎉', 'Celebración'], ['🔥', 'Fuego']
  ];
  const pickers = [];

  function createPicker(formId, inputId) {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const bottom = form?.querySelector('.composer-bottom');
    if (!form || !input || !bottom) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'emoji-picker';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'emoji-toggle';
    toggle.setAttribute('aria-label', 'Elegir emoji');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = 'Elegir emoji';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14.5a5 5 0 0 0 8 0"/><path d="M9 9h.01M15 9h.01" stroke-width="3"/></svg><span>Emojis</span>';

    const menu = document.createElement('div');
    menu.className = 'emoji-menu';
    menu.id = formId + '-emoji-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Emojis básicos');
    toggle.setAttribute('aria-controls', menu.id);

    const heading = document.createElement('div');
    heading.className = 'emoji-menu-title';
    heading.textContent = 'Emojis básicos';
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';

    function close() {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    for (const [symbol, label] of emojis) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'emoji-choice';
      choice.textContent = symbol;
      choice.title = label;
      choice.setAttribute('aria-label', label);
      choice.addEventListener('click', () => {
        if (input.disabled) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const maxLength = input.maxLength;
        // Los límites existentes (500/1000) siguen vigentes para Unicode.
        if (maxLength >= 0 && input.value.length - (end - start) + symbol.length > maxLength) {
          close();
          input.focus();
          return;
        }
        input.setRangeText(symbol, start, end, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        close();
        input.focus();
      });
      grid.append(choice);
    }

    menu.append(heading, grid);
    wrapper.append(toggle, menu);
    bottom.prepend(wrapper);

    toggle.addEventListener('click', () => {
      if (input.disabled) return;
      const opening = menu.hidden;
      for (const picker of pickers) picker.close();
      if (opening) {
        menu.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
      }
    });

    const syncDisabled = () => {
      toggle.disabled = input.disabled;
      if (input.disabled) close();
    };
    new MutationObserver(syncDisabled).observe(input, {
      attributes: true,
      attributeFilter: ['disabled']
    });
    syncDisabled();
    pickers.push({ wrapper, close, toggle, menu });
  }

  createPicker('chat-form', 'chat-content');
  createPicker('dm-form', 'dm-content');

  document.addEventListener('pointerdown', event => {
    for (const picker of pickers) {
      if (!picker.wrapper.contains(event.target)) picker.close();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    for (const picker of pickers) {
      if (!picker.menu.hidden) {
        picker.close();
        picker.toggle.focus();
      }
    }
  });
})();
