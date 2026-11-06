/** Game-owned speech UI. Text is data; it cannot execute host mechanics. */
export function createSpeechBubble(
  parent: HTMLElement,
  name: string,
  floating = true,
) {
  const element = document.createElement("div");
  element.className = "game-speech-bubble";
  element.hidden = true;
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.style.cssText = `${floating ? "position:absolute;z-index:6;transform:translate(-50%,-100%);width:max-content;" : "position:relative;margin:10px 0 6px;"}max-width:min(260px,calc(100% - 20px));padding:10px 13px;border:1px solid var(--border,#d6d0bc);border-radius:14px 14px 14px 3px;background:var(--card,#fffdf4);color:var(--foreground,#37352f);box-shadow:0 5px 16px #0000001a;font-family:inherit;overflow-wrap:anywhere;pointer-events:auto;`;
  const speaker = document.createElement("strong");
  speaker.textContent = name;
  speaker.style.cssText =
    "display:block;font-size:10px;opacity:.65;margin-bottom:4px";
  const text = document.createElement("span");
  text.setAttribute("aria-hidden", "true");
  text.style.cssText =
    "display:block;font-size:13px;line-height:1.45;max-height:130px;overflow:auto";
  const accessible = document.createElement("span");
  accessible.style.cssText =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
  const tail = document.createElement("span");
  tail.setAttribute("aria-hidden", "true");
  tail.style.cssText = floating
    ? "position:absolute;bottom:-7px;left:calc(50% - 6px);border-style:solid;border-width:7px 6px 0;border-color:var(--card,#fffdf4) transparent transparent;pointer-events:none"
    : "position:absolute;left:-7px;top:14px;border-style:solid;border-width:6px 7px 6px 0;border-color:transparent var(--card,#fffdf4) transparent transparent;pointer-events:none";
  element.append(speaker, text, accessible, tail);
  parent.appendChild(element);
  if (floating && getComputedStyle(parent).position === "static")
    parent.style.position = "relative";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let typing: ReturnType<typeof setInterval> | undefined;
  let animation: Animation | undefined;
  let dead = false,
    paused = false,
    queued = false,
    message = "";
  let anchor = { x: 0.5, y: 0.45 };
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function clear() {
    clearTimeout(timer);
    clearInterval(typing);
    animation?.cancel();
  }
  function place(x = anchor.x, y = anchor.y) {
    anchor = { x, y };
    if (!floating || element.hidden || dead) return;
    const width = parent.clientWidth,
      height = parent.clientHeight;
    const half = Math.min(260, Math.max(20, width - 20)) / 2;
    element.style.left = `${Math.max(half + 8, Math.min(width - half - 8, x * width))}px`;
    element.style.top = `${Math.max(element.offsetHeight + 8, Math.min(height - 8, y * height))}px`;
  }
  function show() {
    clear();
    element.hidden = false;
    accessible.textContent = message;
    const letters = Array.from(message);
    let shown = reduced() ? letters.length : 1;
    text.textContent = letters.slice(0, shown).join("");
    place();
    if (!reduced())
      animation = element.animate(
        [
          { opacity: 0, translate: "0 7px" },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: 200, easing: "ease-out" },
      );
    const expire = () => {
      timer = setTimeout(() => {
        element.hidden = true;
      }, 10000);
    };
    if (shown < letters.length)
      typing = setInterval(() => {
        shown = Math.min(letters.length, shown + 2);
        text.textContent = letters.slice(0, shown).join("");
        place();
        if (shown === letters.length) {
          clearInterval(typing);
          expire();
        }
      }, 30);
    else expire();
  }
  return {
    element,
    place,
    say(value: string) {
      if (dead || typeof value !== "string") return;
      const next = value.trim().slice(0, 600);
      if (!next || (next === message && !element.hidden)) return;
      message = next;
      if (paused) {
        queued = true;
        return;
      }
      show();
    },
    pause() {
      if (dead) return;
      paused = true;
      clear();
      element.hidden = true;
    },
    resume() {
      if (dead) return;
      paused = false;
      if (queued) {
        queued = false;
        show();
      }
    },
    destroy() {
      if (dead) return;
      dead = true;
      clear();
      element.remove();
    },
  };
}
