/**
 * Administration.jsx — Routeur module Administration ERP CITYMO
 * Sous-modules : Utilisateurs · Rôles & Permissions · Sauvegardes
 */
import { useState } from 'react';
import Utilisateurs from './administration/Utilisateurs.jsx';
import Roles        from './administration/Roles.jsx';
import Sauvegardes  from './administration/Sauvegardes.jsx';

export default function Administration({ activeTab }) {
  const tab = activeTab || 'utilisateurs';

  // État partagé entre Utilisateurs et Rôles
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);

  return (
    <div>
      {tab === 'utilisateurs' && (
        <Utilisateurs
          roles={roles}
          onUsersChange={setUsers}
        />
      )}
      {tab === 'roles' && (
        <Roles
          users={users}
          onRolesChange={setRoles}
        />
      )}
      {tab === 'sauvegardes' && (
        <Sauvegardes />
      )}
    </div>
  );
}
