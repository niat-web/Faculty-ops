import{c as d,r as x,j as s,D as h}from"./index-BJY0MEPh.js";/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=d("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.451.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=d("ChevronsUpDown",[["path",{d:"m7 15 5 5 5-5",key:"1hf1tw"}],["path",{d:"m7 9 5-5 5 5",key:"sgt6xg"}]]);function f(o="",e="",t){const[a,n]=x.useState({sort:o,dir:e});return{...a,toggle:r=>{n(c=>c.sort!==r?{sort:r,dir:"asc"}:c.dir==="asc"?{sort:r,dir:"desc"}:{sort:"",dir:""}),t==null||t()},setSort:n}}function m({label:o,k:e,state:t,onToggle:a,className:n="",align:i="left"}){if(!e)return s.jsx("th",{className:n,children:o});const r=t.sort===e,c=r?t.dir==="asc"?"ascending":"descending":"none",u=i==="right"?"justify-end":i==="center"?"justify-center":"justify-start";return s.jsx("th",{className:n,"aria-sort":c,children:s.jsxs("button",{type:"button",onClick:()=>a(e),className:`inline-flex w-full items-center gap-1 ${u} hover:text-slate-700`,children:[s.jsx("span",{children:o}),r?t.dir==="asc"?s.jsx(l,{className:"h-3.5 w-3.5 text-brand-600"}):s.jsx(h,{className:"h-3.5 w-3.5 text-brand-600"}):s.jsx(p,{className:"h-3.5 w-3.5 text-slate-300"})]})})}export{m as S,f as u};
