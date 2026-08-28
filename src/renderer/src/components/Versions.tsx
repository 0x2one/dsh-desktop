import { useState } from 'react'

function Versions(): React.JSX.Element | null {
  const [versions] = useState(() => window.electron?.process?.versions)

  if (versions === undefined) return null

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
