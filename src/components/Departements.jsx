import { Building2, Users, Lock, Info } from 'lucide-react';
import { DEPARTMENTS } from '../data/departments';

const DEPT_COLORS  = ['#FFEBEE','#E8F5E9','#E3F2FD','#FFF8E1','#F3E5F5','#E0F7FA','#FBE9E7','#E8EAF6','#F1F8E9'];
const DEPT_ACCENTS = ['#D32F2F','#2E7D32','#1565C0','#F57F17','#6A1B9A','#00838F','#BF360C','#283593','#558B2F'];

export default function Departements() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Departements</h1>
          <p className="page-subtitle">Structure organisationnelle de CITYMO — donnees systeme non modifiables</p>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#E3F2FD', border: '1px solid #90CAF9', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 20, fontSize: '0.85rem', color: '#1565C0' }}>
        <Lock size={15} style={{ flexShrink: 0 }} />
        <span>
          <strong>Departements systeme</strong> — Cette liste est fixee par la configuration de CITYMO et ne peut pas etre modifiee.
          Tous les modules (Employes, Projets, Taches, Achats, Charges) utilisent ces departements comme reference unique.
        </span>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Building2 size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{DEPARTMENTS.length}</div>
            <div className="stat-label">Departements actifs</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Users size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">9</div>
            <div className="stat-label">Codes fonctionnels</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Lock size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.9rem' }}>Systeme</div>
            <div className="stat-label">Acces en lecture seule</div>
          </div>
        </div>
      </div>

      {/* Department cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {DEPARTMENTS.map((d, i) => {
          const bg     = DEPT_COLORS[i % DEPT_COLORS.length];
          const accent = DEPT_ACCENTS[i % DEPT_ACCENTS.length];
          return (
            <div
              key={d.id}
              className="card"
              style={{ borderLeft: `4px solid ${accent}`, padding: 20, position: 'relative' }}
            >
              {/* Lock badge */}
              <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4, background: '#F5F5F5', borderRadius: 20, padding: '2px 8px', fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>
                <Lock size={9} /> SYSTEME
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building2 size={18} style={{ color: accent }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', color: accent, letterSpacing: '0.02em', lineHeight: 1.3 }}>{d.nom}</div>
                  <div style={{ fontSize: '0.72rem', background: bg, color: accent, padding: '1px 7px', borderRadius: 10, display: 'inline-block', fontWeight: 700, marginTop: 3 }}>
                    {d.code}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>
                {d.description}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--text-3)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <Info size={11} />
                <span>ID: {d.id} &nbsp;·&nbsp; Utilise dans : Employes, Projets, Taches, Achats, Charges</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
