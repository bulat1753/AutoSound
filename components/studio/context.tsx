"use client";
import { createContext, useContext } from "react";
import type { CalendarEvent, Order, Person, Service } from "../../lib/domain";
export type StudioData = { user: Person; people: Person[]; orders: Order[]; services: Service[]; events: CalendarEvent[]; mailReady: boolean; localPreview?: boolean };
export const StudioContext = createContext<{ data: StudioData; refresh: () => Promise<void>; notify: (message: string, error?: boolean) => void; go: (path: string) => void }> (null!);
export const useStudio = () => useContext(StudioContext);
