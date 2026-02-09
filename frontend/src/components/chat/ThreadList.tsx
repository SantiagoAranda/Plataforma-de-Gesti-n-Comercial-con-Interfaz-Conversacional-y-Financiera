"use client";

import { useRouter } from "next/navigation";
import ThreadItem from "./ThreadItem";
import { HOME_THREADS } from "./homeThreads";

export default function ThreadList() {
  const router = useRouter();

  return (
    <div>
      {HOME_THREADS.map((thread) => (
        <ThreadItem
          key={thread.id}
          title={thread.title}
          preview={thread.preview}
          time={thread.time}
          active={thread.active}
          icon={thread.icon}
          onClick={() => router.push(thread.route)}
        />
      ))}
    </div>
  );
}
