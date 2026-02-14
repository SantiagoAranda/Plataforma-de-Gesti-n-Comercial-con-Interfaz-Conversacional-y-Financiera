"use client";

export default function SalesSearchBar({
    value,
    onChange,
    onAction,
}: {
    value: string;
    onChange: (v: string) => void;
    onAction: () => void;
}) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-100/80 backdrop-blur-md px-4 py-4 border-t border-gray-200">
            <div className="flex items-center gap-3 max-w-md mx-auto">
                <div className="flex-[2] flex items-center bg-white  rounded-full px-4 py-2 shadow-sm">
                    <input
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm py-1 px-1 text-gray-700 placeholder-gray-500"
                        placeholder="Buscar productos..."
                        type="text"
                    />
                </div>

                <button
                    onClick={onAction}
                    className="size-14 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                    aria-label="Acción"
                >
                    <span className="text-[18px]">➤</span>
                </button>
            </div>
        </div>
    );
}
