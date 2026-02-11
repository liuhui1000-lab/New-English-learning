import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 text-center px-4">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl mb-6">
        English Learning App
        <span className="text-indigo-600 block text-2xl mt-2">(v1.0 Phase 1 Completed)</span>
      </h1>
      <p className="mt-4 text-xl text-gray-500 max-w-2xl mx-auto">
        欢迎来到上海初中英语提升平台。
        <br />
        已部署 CI/CD 自动化流程 (Dev -> Test -> Prod)。
      </p>

      <div className="mt-10 flex items-center justify-center gap-x-6">
        <a
          href="/login"
          className="rounded-md bg-indigo-600 px-5 py-3 text-lg font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          立即登录 / 开始使用
        </a>
      </div>

      <div className="mt-12 text-sm text-gray-400">
        Internal Preview Build
      </div>
    </div>
  );
}
