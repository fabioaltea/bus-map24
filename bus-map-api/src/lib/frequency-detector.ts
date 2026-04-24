export interface FrequencyRun {
  startIdx: number
  endIdx: number
  headwaySec: number
  startTimeSec: number
  endTimeSec: number
}

export function collapseToFrequencies(startTimesSec: number[]): FrequencyRun[] {
  const runs: FrequencyRun[] = []
  const n = startTimesSec.length

  if (n < 4) return runs

  let i = 0
  while (i <= n - 4) {
    const headway = startTimesSec[i + 1] - startTimesSec[i]
    let j = i + 1
    while (j < n - 1 && startTimesSec[j + 1] - startTimesSec[j] === headway) {
      j++
    }
    if (j - i + 1 >= 4) {
      runs.push({
        startIdx: i,
        endIdx: j,
        headwaySec: headway,
        startTimeSec: startTimesSec[i],
        endTimeSec: startTimesSec[j] + headway,
      })
      i = j + 1
    } else {
      i++
    }
  }
  return runs
}
