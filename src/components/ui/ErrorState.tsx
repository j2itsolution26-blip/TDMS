export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-red-700">{message}</p>
    </div>
  );
}
