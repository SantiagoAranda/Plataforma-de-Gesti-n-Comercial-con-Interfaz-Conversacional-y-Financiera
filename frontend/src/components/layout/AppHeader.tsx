type Props = {
  title?: string;
};

export default function AppHeader({ title = "MVP" }: Props) {
  return (
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
          <div className="w-9 h-9 rounded-full bg-neutral-200" />
          <h1 className="text-sm font-semibold tracking-wide text-neutral-600">
              MVP
          </h1>
          <button className="text-xl text-neutral-500">⋮</button>
      </header>
  );
}
