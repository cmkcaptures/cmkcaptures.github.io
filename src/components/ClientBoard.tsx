import { useState } from 'react'
import type { DragEvent } from 'react'
import type { Client, Stage } from '../types'
import { STAGES } from '../types'
import ClientCard from './ClientCard'
import '../studio/Board.css'

interface Props {
  clients: Client[]
  onCardClick: (client: Client) => void
  onMove: (client: Client, stage: Stage) => void
  onLive: (client: Client) => void
}

const STAGE_HINT: Record<Stage, string> = {
  inquiry: 'New messages and website bookings',
  booked: 'Date set, deposit in',
  shot: 'Editing time',
  delivered: 'Gallery sent',
  paid: 'All done',
}

export default function ClientBoard({ clients, onCardClick, onMove, onLive }: Props) {
  const [focus, setFocus] = useState<Stage | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)

  function drop(e: DragEvent, stage: Stage) {
    e.preventDefault()
    setOver(null)
    const client = clients.find((c) => c.id === e.dataTransfer.getData('text/client'))
    if (client && client.stage !== stage) onMove(client, stage)
    setDragging(null)
  }

  const total = clients.length || 1

  return (
    <div className="bd">
      <div className="bd-journey" role="tablist" aria-label="Stages">
        {STAGES.map((s, i) => {
          const count = clients.filter((c) => c.stage === s.key).length
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={focus === s.key}
              className={`bd-step st-${s.key}${focus === s.key ? ' on' : ''}${count ? ' has' : ''}`}
              onClick={() => setFocus((f) => (f === s.key ? null : s.key))}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="bd-step-count">{count}</span>
              <span className="bd-step-label">{s.label}</span>
              <span className="bd-step-bar">
                <i style={{ width: `${(count / total) * 100}%` }} />
              </span>
            </button>
          )
        })}
      </div>

      <div className="board-scroll">
        <div className="bd-board">
          {STAGES.map((stage, i) => {
            const stageClients = clients.filter((c) => c.stage === stage.key)
            const dim = focus && focus !== stage.key
            return (
              <div
                key={stage.key}
                className={`bd-col st-${stage.key}${over === stage.key ? ' over' : ''}${dim ? ' dim' : ''}${dragging ? ' dragging' : ''}`}
                style={{ animationDelay: `${i * 0.06}s` }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(stage.key)
                }}
                onDragLeave={() => setOver((o) => (o === stage.key ? null : o))}
                onDrop={(e) => drop(e, stage.key)}
              >
                <header>
                  <span className="bd-col-dot" />
                  <b>{stage.label}</b>
                  <em>{stageClients.length}</em>
                </header>
                <p className="bd-col-hint">{STAGE_HINT[stage.key]}</p>
                <div className="bd-cards">
                  {stageClients.map((client) => (
                    <div
                      key={client.id}
                      draggable
                      className={dragging === client.id ? 'bd-lift' : ''}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/client', client.id)
                        setDragging(client.id)
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setOver(null)
                      }}
                    >
                      <ClientCard client={client} onClick={() => onCardClick(client)} onAdvance={(to) => onMove(client, to)} onLive={() => onLive(client)} />
                    </div>
                  ))}
                  <div className="bd-drop">{dragging ? 'Drop here' : stageClients.length ? '' : 'Empty'}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
