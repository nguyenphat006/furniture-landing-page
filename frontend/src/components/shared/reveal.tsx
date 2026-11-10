/*
 * Hiện dần khi cuộn tới (2026-11-09, docs/superpowers/specs/2026-11-09-design-refresh-design.md).
 *
 * Phần tử gắn {...reveal("fade-up" | "stagger" | "heading" | "image")}. Script inline đầu <body> gắn class
 * "js" lên <html>, theo dõi mọi [data-reveal] bằng một IntersectionObserver và gắn data-shown khi
 * phần tử vào màn hình (một lần). Hiệu ứng nằm trong globals.css (mục "Reveal").
 *
 * Vì sao script inline mà không phải component client: chạy ngay khi HTML đang tải nên nội dung ở màn
 * hình đầu hiện liền, không chờ hydrate. MutationObserver bắt phần tử mới (chuyển trang, lọc sản phẩm).
 * Cuộn tới cuối trang, hoặc phần tử đã bị lướt qua phía trên (bấm link neo, cuộn nhanh), thì hiện luôn.
 * Không JS, bot, prefers-reduced-motion: CSS không ẩn gì, nội dung đứng yên.
 * data-shown được thêm trước khi React hydrate, nên phần tử cần suppressHydrationWarning (có sẵn trong reveal()).
 */

export type RevealKind = "fade-up" | "stagger" | "heading" | "image";

export function reveal(kind: RevealKind) {
  return { "data-reveal": kind, suppressHydrationWarning: true } as const;
}

export const REVEAL_SCRIPT = `(function(){if(window.__bfcReveal)return;window.__bfcReveal=1;var d=document.documentElement;d.classList.add("js");
if(!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("reveal-off");return}
function show(el){el.setAttribute("data-shown","");io.unobserve(el)}
var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++)if(es[i].isIntersecting)show(es[i].target)},{rootMargin:"0px 0px -6% 0px"});
function scan(n){if(n.nodeType!==1)return;if(n.hasAttribute("data-reveal")&&!n.hasAttribute("data-shown"))io.observe(n);
var l=n.querySelectorAll("[data-reveal]:not([data-shown])");for(var i=0;i<l.length;i++)io.observe(l[i])}
new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var a=ms[i].addedNodes;for(var j=0;j<a.length;j++)scan(a[j])}}).observe(d,{childList:true,subtree:true});scan(d);
var tick=0;addEventListener("scroll",function(){if(tick)return;tick=requestAnimationFrame(function(){tick=0;
var end=innerHeight+scrollY>=document.documentElement.scrollHeight-4,l=document.querySelectorAll("[data-reveal]:not([data-shown])");
for(var i=0;i<l.length;i++)if(end||l[i].getBoundingClientRect().bottom<0)show(l[i])})},{passive:true})})();`;

// Thẻ <script> đặt đầu <body>: RevealScript trong reveal-script.tsx (component client)
