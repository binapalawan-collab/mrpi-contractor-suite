import { useEffect, useState, type CSSProperties } from 'react'
import { loadWorker } from '../lib/queries'
import { WorkerReportPage } from './WorkerReportPage'

type WorkerNameStyle = CSSProperties & { '--worker-report-name'?: string }

export function NamedWorkerReportPage({ workerId }: { workerId: string }) {
  const parsedWorkerId = Number(workerId)
  const [workerName, setWorkerName] = useState('')

  useEffect(() => {
    let ignore = false
    if (!Number.isInteger(parsedWorkerId) || parsedWorkerId <= 0) return () => { ignore = true }
    loadWorker(parsedWorkerId)
      .then((worker) => {
        if (!ignore) setWorkerName(worker?.name ?? '')
      })
      .catch(() => {
        if (!ignore) setWorkerName('')
      })
    return () => { ignore = true }
  }, [parsedWorkerId])

  const escapedName = workerName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const style: WorkerNameStyle = { '--worker-report-name': `"${escapedName}"` }

  return <div className="named-worker-report" style={style}>
    <WorkerReportPage workerId={workerId} />
  </div>
}
