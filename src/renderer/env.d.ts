declare global { interface Window { api: any } }
declare module '*.png' { const source: string; export default source }
export {}
