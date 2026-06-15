import { Users } from 'lucide-react';
import { fetchDisposalCommissionsPageApi, type DisposalCommissionDto } from '../api/disposal-api';
import { PageHeaderRow } from './ui/page-header-row';
import { ResponsiveTable } from './ui/responsive-table';
import { PaginationControls } from './ui/pagination-controls';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { AlertBanner } from './ui/alert-banner';

export const DisposalCommissionsPage = () => {
  const commissionsList = usePaginatedList<DisposalCommissionDto>({
    fetchPage: fetchDisposalCommissionsPageApi,
  });
  const commissions = commissionsList.items;
  const loading = commissionsList.isLoading;

  return (
    <div className="space-y-6">
      <PageHeaderRow
        title="Komisije za rashod"
        description="Komisije se kreiraju automatski uz popisne komisije u sesiji inventure. Odluke o rashodu donose se u inboxu predsjednika na zatvaranju popisa."
      />
      <AlertBanner tone="info">
        Nova komisija rashoda nije moguća samostalno — definirajte je kroz wizard popisne komisije (Inventurni popis).
      </AlertBanner>
      <div>
        <h2 className="text-sm font-medium text-gray-800 mb-2 flex items-center gap-2">
          <Users size={16} />
          Komisije vezane uz popis
        </h2>
        <ResponsiveTable
          isEmpty={commissions.length === 0 && !loading}
          emptyMessage="Nema komisija za rashod."
          mobile={commissions.map((commission) => (
            <div key={commission.id} className="p-4 space-y-2">
              <p className="font-medium text-gray-800">{commission.city?.name ?? commission.cityId}</p>
              <p className="text-sm text-gray-700">{commission.name}</p>
              <ul className="text-xs text-gray-600 space-y-1">
                {commission.members.map((member) => (
                  <li key={member.employeeId}>
                    {member.employee
                      ? `${member.employee.firstName} ${member.employee.lastName}`
                      : member.employeeId}
                    {member.role === 'predsjednik' ? ' (predsjednik)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          desktop={
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Grad</th>
                  <th className="text-left px-4 py-2 font-medium">Naziv</th>
                  <th className="text-left px-4 py-2 font-medium">Članovi</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => (
                  <tr key={commission.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">
                        {commission.city?.name ?? commission.cityId}
                      </div>
                      {commission.city?.canton?.name ? (
                        <div className="text-xs text-gray-500">{commission.city.canton.name}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium">{commission.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <ul className="space-y-1">
                        {commission.members.map((member) => (
                          <li key={member.employeeId}>
                            {member.employee
                              ? `${member.employee.firstName} ${member.employee.lastName}`
                              : member.employeeId}
                            {member.role === 'predsjednik' ? ' (predsjednik)' : ''}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
        {commissionsList.meta ? (
          <PaginationControls
            page={commissionsList.meta.page}
            pageSize={commissionsList.meta.pageSize}
            total={commissionsList.meta.total}
            totalPages={commissionsList.meta.totalPages}
            onPageChange={commissionsList.setPage}
            onPageSizeChange={commissionsList.setPageSize}
          />
        ) : null}
      </div>
    </div>
  );
};
