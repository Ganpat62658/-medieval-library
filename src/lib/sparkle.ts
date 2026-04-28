// src/lib/sparkle.ts
// Medieval fantasy sparkle animation — plays on a book element when highlighted

export function playSparkle(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const container = document.createElement('div');
  container.style.cssText = `
    position:fixed;
    left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:${rect.height}px;
    pointer-events:none;z-index:9999;overflow:visible;
  `;
  document.body.appendChild(container);

  const symbols = ['✦','✧','⋆','✶','✸','❋','⁂','✺','❊','✴'];
  const colors  = ['#C8A84B','#E8C878','#FFE066','#FFF3AA','#D4A840','#FCEAA0'];
  const count = 18;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    const sym   = symbols[Math.floor(Math.random() * symbols.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size  = 10 + Math.random() * 14;
    const angle = (i / count) * 360 + Math.random() * 20;
    const dist  = 30 + Math.random() * 55;
    const dur   = 0.55 + Math.random() * 0.45;
    const delay = Math.random() * 0.25;

    const rad   = (angle * Math.PI) / 180;
    const tx    = Math.cos(rad) * dist;
    const ty    = Math.sin(rad) * dist;

    spark.textContent = sym;
    spark.style.cssText = `
      position:absolute;
      left:${rect.width / 2}px;top:${rect.height / 2}px;
      font-size:${size}px;
      color:${color};
      text-shadow:0 0 6px ${color};
      pointer-events:none;
      animation:sparkle-fly ${dur}s ${delay}s ease-out forwards;
      --tx:${tx}px;--ty:${ty}px;
      transform-origin:center;
      opacity:0;
    `;
    container.appendChild(spark);
  }

  // Glow ring on the book itself
  element.style.transition = 'box-shadow 0.15s ease';
  element.style.boxShadow = '0 0 0 2px #C8A84B, 0 0 24px 8px rgba(200,168,75,0.7), 0 0 48px 16px rgba(200,168,75,0.3)';
  element.style.zIndex = '50';

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes sparkle-fly {
      0%   { opacity:0; transform:translate(0,0) scale(0.3) rotate(0deg); }
      30%  { opacity:1; }
      100% { opacity:0; transform:translate(var(--tx),var(--ty)) scale(1.1) rotate(${Math.random()>0.5?'':'-'}${60+Math.random()*80}deg); }
    }
  `;
  document.head.appendChild(styleEl);

  // Cleanup
  setTimeout(() => {
    element.style.boxShadow = '';
    element.style.zIndex = '';
    container.remove();
    styleEl.remove();
  }, 1400);
}
