"use client";

import { useEffect, useState } from "react";
import { WebContainer } from "@webcontainer/api";

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export function useWebContainer() {
  const [webContainer, setWebContainer] =
    useState<WebContainer | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootWebContainer() {
      if (!webcontainerInstance) {
        if (!bootPromise) {
          bootPromise = WebContainer.boot().catch((err) => {
            bootPromise = null;
            webcontainerInstance = null;
            throw err;
          });
        }
        try {
          webcontainerInstance = await bootPromise;
        } catch (err) {
          if (!cancelled) {
            const message =
              err instanceof Error ? err.message : "Failed to boot WebContainer";
            console.error("WebContainer boot failed:", message);
            setBootError(message);
          }
          return;
        }
      }

      if (!cancelled) {
        setWebContainer(webcontainerInstance);
      }
    }

    bootWebContainer();

    return () => {
      cancelled = true;
    };
  }, []);

  return { webContainer, bootError };
}