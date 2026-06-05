import { useEffect, useState } from 'react';
import { fetchEmployeeApi } from '../api/employees-api';
import { useAuth } from '../contexts/AuthContext';
import type { Employee } from '../types';

export function useCurrentEmployee(): Employee | null {
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (!user?.employeeId) {
      setEmployee(null);
      return;
    }
    let active = true;
    void fetchEmployeeApi(user.employeeId)
      .then((row) => {
        if (active) {
          setEmployee(row);
        }
      })
      .catch(() => {
        if (active) {
          setEmployee(null);
        }
      });
    return () => {
      active = false;
    };
  }, [user?.employeeId]);

  return employee;
}
