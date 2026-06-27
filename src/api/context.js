// Live-mode request context (org/rep), set once at bootstrap.
let ctx = { orgId: null, repId: null };
export const getCtx = () => ctx;
export const setCtx = (c) => { ctx = { ...ctx, ...c }; };
