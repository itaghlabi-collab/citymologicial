/**
 * VehicleDailyReportModal.jsx — Compte rendu journalier / déplacements véhicule
 */
import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ClipboardList, CheckCircle, Loader2, MapPin } from 'lucide-react';
import {
  getDailyReportForVehicleDate,
  saveDailyReport,
  OBJETS_MISSION,
} from '../../services/logistique/vehicleDailyReports';

const INPUT_STYLE = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyTrip() {
  return {
    heure_depart: '', heure_arrivee: '', lieu_depart: '', lieu_arrivee: '',
    objet_mission: 'Chantier', projet_ref: '', projet_nom: '', km_parcourus: '', observations: '',
  };
}

export default function VehicleDailyReportModal({ open, vehicle, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date_rapport: todayIso(),
    chauffeur: '',
    km_depart: '',
    km_arrivee: '',
    carburant_litres: '',
    observations: '',
  });
  const [trips, setTrips] = useState([emptyTrip()]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open || !vehicle?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const existing = await getDailyReportForVehicleDate(vehicle.id, form.date_rapport);
        if (cancelled) return;
        if (existing) {
          setForm({
            date_rapport: existing.date_rapport || todayIso(),
            chauffeur: existing.chauffeur || vehicle.chauffeur || '',
            km_depart: existing.km_depart || vehicle.km_actuel || '',
            km_arrivee: existing.km_arrivee || '',
            carburant_litres: existing.carburant_litres || '',
            observations: existing.observations || '',
          });
          setTrips(existing.trips?.length ? existing.trips : [emptyTrip()]);
        } else {
          setForm({
            date_rapport: todayIso(),
            chauffeur: vehicle.chauffeur || '',
            km_depart: vehicle.km_actuel || '',
            km_arrivee: '',
            carburant_litres: '',
            observations: '',
          });
          setTrips([emptyTrip()]);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Erreur de chargement.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, vehicle?.id]);

  async function loadForDate(date) {
    if (!vehicle?.id) return;
    setLoading(true);
    setError('');
    try {
      const existing = await getDailyReportForVehicleDate(vehicle.id, date);
      if (existing) {
        setForm((p) => ({
          ...p,
          date_rapport: date,
          chauffeur: existing.chauffeur || vehicle.chauffeur || '',
          km_depart: existing.km_depart || p.km_depart,
          km_arrivee: existing.km_arrivee || '',
          carburant_litres: existing.carburant_litres || '',
          observations: existing.observations || '',
        }));
        setTrips(existing.trips?.length ? existing.trips : [emptyTrip()]);
      } else {
        setForm((p) => ({
          ...p,
          date_rapport: date,
          km_arrivee: '',
          carburant_litres: '',
          observations: '',
        }));
        setTrips([emptyTrip()]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateTrip(idx, patch) {
    setTrips((list) => list.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function addTrip() {
    setTrips((list) => [...list, emptyTrip()]);
  }

  function removeTrip(idx) {
    setTrips((list) => (list.length <= 1 ? [emptyTrip()] : list.filter((_, i) => i !== idx)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!vehicle) return;
    setSaving(true);
    setError('');
    try {
      await saveDailyReport(vehicle, form, trips);
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Erreur enregistrement.');
    } finally {
      setSaving(false);
    }
  }

  if (!open || !vehicle) return null;

  const kmDepart = Number(form.km_depart) || 0;
  const kmArrivee = Number(form.km_arrivee) || 0;
  const kmJour = kmArrivee > kmDepart ? kmArrivee - kmDepart : null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 24px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClipboardList size={14} /> Compte rendu journalier
            </div>
            <h2 style={{ margin: '6px 0 0', fontSize: '1.1rem', fontWeight: 800 }}>
              {vehicle.matricule} — {[vehicle.marque, vehicle.modele].filter(Boolean).join(' ')}
            </h2>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </header>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div style={{ background: '#FFEBEE', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, fontSize: '0.84rem', marginBottom: 16 }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" /></div>
          ) : (
            <>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', marginBottom: 12 }}>Informations du jour</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>Date *</label>
                  <input
                    style={INPUT_STYLE}
                    type="date"
                    required
                    value={form.date_rapport}
                    onChange={(e) => {
                      set('date_rapport', e.target.value);
                      loadForDate(e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>Chauffeur</label>
                  <input style={INPUT_STYLE} value={form.chauffeur} onChange={(e) => set('chauffeur', e.target.value)} placeholder="Nom du chauffeur" />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>Km départ</label>
                  <input style={INPUT_STYLE} type="number" min="0" value={form.km_depart} onChange={(e) => set('km_depart', e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>Km fin de journée</label>
                  <input style={INPUT_STYLE} type="number" min="0" value={form.km_arrivee} onChange={(e) => set('km_arrivee', e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>Carburant (L)</label>
                  <input style={INPUT_STYLE} type="number" min="0" step="0.1" value={form.carburant_litres} onChange={(e) => set('carburant_litres', e.target.value)} />
                </div>
                {kmJour != null && (
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ padding: '10px 14px', background: '#E3F2FD', borderRadius: 8, fontSize: '0.84rem', width: '100%' }}>
                      <strong>{kmJour.toLocaleString('fr-MA')} km</strong> parcourus
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} /> Déplacements de la journée
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addTrip}><Plus size={13} /> Ajouter un trajet</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {trips.map((t, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>Trajet {idx + 1}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTrip(idx)} style={{ color: 'var(--red)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Heure départ</label>
                        <input style={INPUT_STYLE} type="time" value={t.heure_depart} onChange={(e) => updateTrip(idx, { heure_depart: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Heure arrivée</label>
                        <input style={INPUT_STYLE} type="time" value={t.heure_arrivee} onChange={(e) => updateTrip(idx, { heure_arrivee: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Objet</label>
                        <select style={SELECT_STYLE} value={t.objet_mission} onChange={(e) => updateTrip(idx, { objet_mission: e.target.value })}>
                          {OBJETS_MISSION.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Km</label>
                        <input style={INPUT_STYLE} type="number" min="0" value={t.km_parcourus} onChange={(e) => updateTrip(idx, { km_parcourus: e.target.value })} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Lieu départ</label>
                        <input style={INPUT_STYLE} value={t.lieu_depart} onChange={(e) => updateTrip(idx, { lieu_depart: e.target.value })} placeholder="Départ" />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Destination</label>
                        <input style={INPUT_STYLE} value={t.lieu_arrivee} onChange={(e) => updateTrip(idx, { lieu_arrivee: e.target.value })} placeholder="Arrivée / chantier" />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Réf. projet</label>
                        <input style={INPUT_STYLE} value={t.projet_ref} onChange={(e) => updateTrip(idx, { projet_ref: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-3)' }}>Nom projet</label>
                        <input style={INPUT_STYLE} value={t.projet_nom} onChange={(e) => updateTrip(idx, { projet_nom: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>Observations</label>
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: 72, resize: 'vertical', marginTop: 5 }}
                  value={form.observations}
                  onChange={(e) => set('observations', e.target.value)}
                  placeholder="Incidents, retards, remarques..."
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving || loading}>
              <CheckCircle size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer le compte rendu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
