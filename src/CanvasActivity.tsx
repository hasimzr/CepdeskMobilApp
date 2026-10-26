import { createContext, useContext } from 'react';
export const CanvasActivity = createContext(true);
export const useCanvasActivity = () => useContext(CanvasActivity);

export const CanvasForeground = createContext(true);
