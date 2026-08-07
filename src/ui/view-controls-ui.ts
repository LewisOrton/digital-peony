export function createMobileParameterDrawerToggle(
  parameterEditor: HTMLElement,
  parameterDrawerContent: HTMLElement,
) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'parameter-drawer-toggle';
  button.innerHTML = `
    <span>Parameters</span>
    <span class="parameter-drawer-chevron" aria-hidden="true"></span>
  `;
  parameterEditor.dataset.mobileOpen = 'false';
  parameterDrawerContent.id = 'parameter-editor-content';
  button.setAttribute('aria-controls', parameterDrawerContent.id);

  function setOpen(open: boolean) {
    parameterEditor.dataset.mobileOpen = String(open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute(
      'aria-label',
      `${open ? 'Close' : 'Open'} parameter editor`,
    );
  }

  setOpen(false);
  button.addEventListener('click', () => {
    setOpen(parameterEditor.dataset.mobileOpen !== 'true');
  });
  return button;
}
