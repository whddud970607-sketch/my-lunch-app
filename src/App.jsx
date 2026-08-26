import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1>My Lunch App</h1>
      <p>점심 메뉴를 고르는 앱의 기본 화면입니다.</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        클릭 횟수: {count}
      </button>
    </main>
  )
}

export default App
