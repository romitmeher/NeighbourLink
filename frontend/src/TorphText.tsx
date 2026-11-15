import { useEffect, useState } from 'react'

interface TorphTextProps {
  words: string[]
  intervalMs?: number
  className?: string
  prefix?: string
  suffix?: string
}

export function TorphText({
  words,
  intervalMs = 3200,
  className = '',
  prefix = '',
  suffix = ''
}: TorphTextProps) {
  const [index, setIndex] = useState(0)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (!words.length || words.length === 1) return
    const timer = setInterval(() => {
      setAnimating(true)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length)
        setAnimating(false)
      }, 220) // match the exit transition duration
    }, intervalMs)

    return () => clearInterval(timer)
  }, [words, intervalMs])

  const currentWord = words[index] || ''

  return (
    <span className={`inline-flex items-center torph-container ${className}`}>
      {prefix && <span className="torph-prefix mr-1">{prefix}</span>}
      <span
        className={`torph-word font-medium transition-all duration-200 ease-out inline-block ${
          animating
            ? 'opacity-0 -translate-y-2.5 scale-95'
            : 'opacity-100 translate-y-0 scale-100'
        }`}
      >
        {currentWord}
      </span>
      {suffix && <span className="torph-suffix ml-1">{suffix}</span>}
    </span>
  )
}
