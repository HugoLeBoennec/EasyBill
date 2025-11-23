/// <reference types="vite/client" />

// Allow importing SQL files as raw strings
declare module '*.sql' {
  const content: string;
  export default content;
}

declare module '*.sql?raw' {
  const content: string;
  export default content;
}
