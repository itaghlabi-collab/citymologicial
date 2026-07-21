/**
 * StarRating.jsx — Notation 1–5 étoiles (Rapport qualité / prix)
 */
import { Star } from 'lucide-react';

export function clampRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return null;
  if (n > 5) return 5;
  return n;
}

export function StarRatingDisplay({ value, size = 14, showEmpty = true, label }) {
  const rating = clampRating(value);
  return (
    <span className="achats-star-rating" title={label || (rating ? `${rating}/5 — Rapport qualité / prix` : 'Non noté')}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = rating != null && n <= rating;
        if (!showEmpty && !on) return null;
        return (
          <Star
            key={n}
            size={size}
            className={on ? 'achats-star-rating__star is-on' : 'achats-star-rating__star'}
            fill={on ? 'currentColor' : 'none'}
          />
        );
      })}
      {rating != null && <span className="achats-star-rating__num">{rating}/5</span>}
      {rating == null && showEmpty && <span className="achats-star-rating__num">—</span>}
    </span>
  );
}

export function StarRatingInput({ value, onChange, disabled }) {
  const rating = clampRating(value);
  return (
    <div className="achats-star-rating achats-star-rating--input" role="group" aria-label="Rapport qualité / prix">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = rating != null && n <= rating;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            className={on ? 'achats-star-btn is-on' : 'achats-star-btn'}
            title={`${n} étoile${n > 1 ? 's' : ''}`}
            aria-pressed={rating === n}
            onClick={() => onChange(rating === n ? null : n)}
          >
            <Star size={20} fill={on ? 'currentColor' : 'none'} />
          </button>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={disabled || rating == null}
        onClick={() => onChange(null)}
        style={{ marginLeft: 4 }}
      >
        Effacer
      </button>
    </div>
  );
}
