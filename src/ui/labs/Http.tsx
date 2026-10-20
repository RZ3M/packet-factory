import { useState, type CSSProperties } from 'react';
import { Quiz } from '../Quiz';

const VERBS = [
  { verb: 'GET', desc: 'Read a resource', idem: true, safe: true, cache: true },
  { verb: 'POST', desc: 'Create a resource or trigger a process', idem: false, safe: false, cache: false },
  { verb: 'PUT', desc: 'Create or replace a resource', idem: true, safe: false, cache: false },
  { verb: 'PATCH', desc: 'Partially update a resource', idem: false, safe: false, cache: false },
  { verb: 'DELETE', desc: 'Delete a resource', idem: true, safe: false, cache: false },
];

const QUESTIONS = [
  {
    q: 'Your internal microservices exchange millions of small messages per second and you control both client and server. Best fit?',
    options: ['REST over JSON', 'RPC (gRPC/Thrift with binary encoding)', 'SOAP', 'Email'],
    answer: 1,
    explain: 'RPC frameworks focus on exposing behaviours with compact binary serialization — great for performance-critical internal traffic you control end to end.',
  },
  {
    q: 'You are exposing a public API for third-party developers. Best default?',
    options: ['REST', 'Custom binary RPC', 'Raw TCP sockets', 'UDP'],
    answer: 0,
    explain: 'REST is a uniform, stateless interface over HTTP: self-documenting resources, HTTP caching, easy for anyone with curl. Ideal for public APIs.',
  },
  {
    q: 'A client retries a request after a timeout. Which method is safe to retry blindly?',
    options: ['POST /payments', 'PATCH /accounts/7 {balance += 10}', 'PUT /users/7 {name: "Ada"}', 'POST /emails'],
    answer: 2,
    explain: 'PUT is idempotent — applying it twice leaves the same state. POSTs (and relative PATCHes) may create duplicates; protect them with idempotency keys.',
  },
  {
    q: 'Which is a known disadvantage of REST?',
    options: [
      'It cannot use HTTP caching',
      'Nested resources can need many round trips, and payloads can grow large',
      'It requires a binary schema',
      'Clients become tightly coupled to server implementations',
    ],
    answer: 1,
    explain: 'Fetching complex hierarchies can take multiple round trips (e.g. a post, its author, its comments), and evolving payloads tends to bloat responses. Tight coupling is an RPC downside.',
  },
];

export function HttpLab() {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  return (
    <div className="cols2">
      <div>
        <div className="card">
          <h3 style={{ marginTop: 0, fontFamily: 'var(--display)' }}>HTTP verbs</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            HTTP is a request/response protocol: a verb, a resource, headers and an optional body. Click a row to check your guess.
          </p>
          <table className="md" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Verb</th>
                <th style={th}>Does</th>
                <th style={th}>Idempotent*</th>
                <th style={th}>Safe</th>
                <th style={th}>Cacheable</th>
              </tr>
            </thead>
            <tbody>
              {VERBS.map((v) => {
                const r = reveal[v.verb];
                const cell = (b: boolean) => <td style={{ ...td, textAlign: 'center' }}>{r ? (b ? <span className="good">yes</span> : <span className="bad">no</span>) : <span className="faint">?</span>}</td>;
                return (
                  <tr key={v.verb} onClick={() => setReveal({ ...reveal, [v.verb]: true })} style={{ cursor: 'pointer' }}>
                    <td style={td} className="mono">
                      <b>{v.verb}</b>
                    </td>
                    <td style={td}>{v.desc}</td>
                    {cell(v.idem)}
                    {cell(v.safe)}
                    {cell(v.cache)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="faint" style={{ fontSize: 12 }}>
            *Idempotent: calling it many times has the same effect as once. Safe: does not modify state. POST/PATCH can be made cacheable with explicit headers, but rarely are.
          </p>
        </div>
        <div className="card md" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>RPC vs REST</h3>
          <table>
            <thead>
              <tr>
                <th>Operation</th>
                <th>RPC</th>
                <th>REST</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sign up</td>
                <td>
                  <code>POST /signup</code>
                </td>
                <td>
                  <code>POST /persons</code>
                </td>
              </tr>
              <tr>
                <td>Read a person</td>
                <td>
                  <code>GET /readPerson?personid=1</code>
                </td>
                <td>
                  <code>GET /persons/1</code>
                </td>
              </tr>
              <tr>
                <td>Update a person</td>
                <td>
                  <code>POST /updatePerson</code>
                </td>
                <td>
                  <code>PUT /persons/1</code>
                </td>
              </tr>
              <tr>
                <td>Delete a person</td>
                <td>
                  <code>POST /deletePerson</code>
                </td>
                <td>
                  <code>DELETE /persons/1</code>
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            <b>RPC</b> exposes <i>actions</i> (call a remote procedure as if it were local). Compact, fast, great inside your own system — but clients couple tightly to the implementation, and HTTP caching is awkward.
          </p>
          <p>
            <b>REST</b> exposes <i>resources</i> through a uniform, stateless interface (URIs + verbs + representations, hypermedia for discovery). Easy to cache, scale and consume — but nested data can mean many round trips.
          </p>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0, fontFamily: 'var(--display)' }}>Check yourself</h3>
        <Quiz questions={QUESTIONS} />
      </div>
    </div>
  );
}

const th: CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border2)', fontSize: 11.5, color: 'var(--muted)' };
const td: CSSProperties = { padding: '7px 8px', borderBottom: '1px solid var(--border)' };
