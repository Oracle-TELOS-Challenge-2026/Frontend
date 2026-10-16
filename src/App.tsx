import { Link, Route, Routes } from 'react-router-dom'

function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 p-6 text-slate-900">
      <Routes>
        <Route
          path="/"
          element={
            <h1 className="text-3xl font-bold tracking-tight">Oracle 해커톤</h1>
          }
        />
        <Route
          path="*"
          element={
            <div className="text-center">
              <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다.</h1>
              <Link
                to="/"
                className="mt-4 inline-block rounded text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                홈으로 돌아가기
              </Link>
            </div>
          }
        />
      </Routes>
    </main>
  )
}

export default App
