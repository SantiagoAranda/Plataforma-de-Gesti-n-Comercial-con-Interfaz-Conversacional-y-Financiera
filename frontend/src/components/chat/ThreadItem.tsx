type Props = {
  title: string;
  preview: string;
  time: string;
  active?: boolean;
  icon: string;
  onClick?: () => void;
};

export default function ThreadItem({
  title,
  preview,
  time,
  active,
  icon,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
        className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 cursor-pointer hover:bg-neutral-50"
    >
      <div className="w-11 h-11 flex items-center justify-center rounded-full bg-neutral-100 text-lg">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between">
          <p className="font-medium truncate">{title}</p>
                  <span
                      className={`text-xs font-medium ${active ? "text-green-500" : "text-neutral-400"
                          }`}
                  >
            {time}
          </span>
        </div>

        <p className="text-sm text-neutral-400 truncate leading-snug">
          {preview}
        </p>
      </div>
    </div>
  );
}
