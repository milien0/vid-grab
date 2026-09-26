"use client";

import { useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/types";

type Connection = "connecting" | "open" | "closed";

export function useJobs(onFinished?: (job: Job) => void) {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [connection, setConnection] = useState<Connection>("connecting");
  const finishedRef = useRef(onFinished);

  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const latest: Record<string, Job> = {};

    const connect = () => {
      setConnection("connecting");
      es = new EventSource("/api/events");
      es.onopen = () => setConnection("open");
      es.addEventListener("snapshot", (e) => {
        const list = JSON.parse((e as MessageEvent).data) as Job[];
        for (const k of Object.keys(latest)) delete latest[k];
        for (const j of list) latest[j.id] = j;
        setJobs(Object.fromEntries(list.map((j) => [j.id, j])));
      });
      es.addEventListener("job", (e) => {
        const job = JSON.parse((e as MessageEvent).data) as Job;
        latest[job.id] = job;
        setJobs((prev) => ({ ...prev, [job.id]: job }));
      });
      es.addEventListener("finished", (e) => {
        const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
        const job = latest[id];
        if (job) finishedRef.current?.(job);
      });
      es.addEventListener("remove", (e) => {
        const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
        delete latest[id];
        setJobs((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });
      es.onerror = () => {
        es?.close();
        if (closed) return;
        setConnection("closed");
        retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, []);

  const list = Object.values(jobs).sort((a, b) => b.createdAt - a.createdAt);
  return { jobs: list, connection };
}
