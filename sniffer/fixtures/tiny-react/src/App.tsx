import { useState } from 'react'

export default function App() {
  const [query, setQuery] = useState('')

  function handleCreateProject() {
    setQuery('draft')
  }

  return (
    <main>
      <nav aria-label="Primary navigation">
        <a href="#dashboard">Dashboard</a>
        <a href="#projects">Projects</a>
        <a href="#reports">Reports</a>
      </nav>
      <section aria-labelledby="dashboard-title">
        <h1 id="dashboard-title">Project Dashboard</h1>
        <button onClick={handleCreateProject}>Create project</button>
        <form aria-label="Project search">
          <label>
            Search projects
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
          </label>
          <button type="button">Filter</button>
        </form>
        <table>
          <thead>
            <tr><th>Name</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>Website refresh</td><td>Active</td></tr>
          </tbody>
        </table>
      </section>
    </main>
  )
}
