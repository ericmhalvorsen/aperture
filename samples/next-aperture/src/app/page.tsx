export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="flex flex-col items-center justify-center p-8 gap-8 text-center max-w-2xl">
        <div className="p-4 bg-indigo-500/10 text-indigo-500 rounded-2xl w-20 h-20 flex items-center justify-center text-4xl shadow-lg border border-indigo-500/20">
          🔌
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Aperture <span className="text-indigo-500">Next.js</span> Example
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          This is a barebones Next.js app with Aperture integrated. Check your bottom right corner for the Aperture connection badge.
        </p>
        <div className="text-sm bg-zinc-200/50 dark:bg-zinc-900 rounded-xl p-6 text-left border border-zinc-200 dark:border-zinc-800 w-full">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">What you can do:</h2>
          <ul className="list-disc list-inside space-y-2 text-zinc-600 dark:text-zinc-400">
            <li>Have an MCP-enabled agent query <code className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-indigo-400">tools/list</code> to see the built-in browser tools and the custom <code className="bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-indigo-400">get_dummy_data</code> tool.</li>
            <li>Run a browser DOM query to read this text.</li>
            <li>Capture a screenshot of this page.</li>
            <li>Click the Aperture badge to manage permissions.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
