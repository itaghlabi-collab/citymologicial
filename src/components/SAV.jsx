import { MessageSquare, Plus, Edit2, Clock, CheckCircle, AlertCircle, User } from 'lucide-react';
import { useState } from 'react';

const tickets = [];
const comptes = [];

function priorityBadge(p) {
  if (p === 'Critique') return 'badge-red';
  if (p === 'Haute') return 'badge-orange';
  return 'badge-blue';
}

function statusBadge(s) {
  if (s === 'Resolu') return 'badge-green';
  if (s === 'En cours') return 'badge-blue';
  return 'badge-orange';
}

function StatusIcon({ s }) {
  if (s === 'Resolu') return <CheckCircle size={14} style={{ color: '#2E7D32' }} />;
  if (s === 'En cours') return <Clock size={14} style={{ color: '#1565C0' }} />;
  return <AlertCircle size={14} style={{ color: 'var(--red)' }} />;
}

export default function SAV() {
  const [tab, setTab] = useState('tickets');

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Service Apres-Vente</h1>
          <p className="page-subtitle">Tickets, comptes rendus et historique client</p>
        </div>
        <button className="btn btn-primary"><Plus size={15} /> Nouveau ticket</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><MessageSquare size={18} /></div><div className="stat-body"><div className="stat-value">7</div><div className="stat-label">Tickets ouverts</div></div></div>
        <div className="stat-card"><div className="stat-icon blue"><Clock size={18} /></div><div className="stat-body"><div className="stat-value">3</div><div className="stat-label">En cours</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><CheckCircle size={18} /></div><div className="stat-body"><div className="stat-value">28</div><div className="stat-label">Resolus ce mois</div></div></div>
        <div className="stat-card"><div className="stat-icon orange"><AlertCircle size={18} /></div><div className="stat-body"><div className="stat-value">1</div><div className="stat-label">Critiques</div></div></div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {[['tickets', 'Tickets SAV'], ['comptes', 'Comptes rendus'], ['historique', 'Historique client']].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', background: 'none', color: tab === k ? 'var(--red)' : 'var(--text-2)', borderBottom: tab === k ? '2px solid var(--red)' : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>
            {v}
          </button>
        ))}
      </div>

      {tab === 'tickets' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><MessageSquare size={16} /> Tickets SAV</div>
            <button className="btn btn-primary btn-sm"><Plus size={14} /> Nouveau ticket</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ticket</th><th>Client</th><th>Sujet</th><th>Date</th><th>Priorite</th><th>Technicien</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {tickets.map((t, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{t.id}</td>
                    <td style={{ fontWeight: 600 }}>{t.client}</td>
                    <td>{t.sujet}</td>
                    <td>{t.date}</td>
                    <td><span className={'badge ' + priorityBadge(t.priorite)}>{t.priorite}</span></td>
                    <td>{t.technicien}</td>
                    <td>
                      <span className={'badge ' + statusBadge(t.status)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <StatusIcon s={t.status} /> {t.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm">Voir</button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'comptes' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><Edit2 size={16} /> Comptes rendus d'intervention</div>
            <button className="btn btn-primary btn-sm"><Plus size={14} /> Nouveau CR</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comptes.map((c, i) => (
              <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
                <div className="flex-between mb-4" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{c.ticket}</span>
                    <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} /> Resolu</span>
                  </div>
                  <span className="text-muted">{c.date}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <User size={13} style={{ color: 'var(--text-3)' }} />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 600 }}>{c.technicien}</span>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text)' }}>{c.resume}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'historique' && (
        <div className="card">
          <div className="card-title"><User size={16} /> Historique par client</div>
          <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-3)' }}>
            <User size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Aucun historique client</div>
            <div style={{ fontSize: '0.84rem' }}>Les tickets resolus apparaitront ici par client</div>
          </div>
        </div>
      )}
    </div>
  );
}
