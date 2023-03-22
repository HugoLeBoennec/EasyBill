import { Children } from 'react';

const TableHeader = () => {
  return (
    <thead className="bg-slate-50 border-b border-slate-200">
      <tr className="text-left">
        <th
          className="px-6 py-3 text-left text-sm font-medium text-slate-900"
          scope="col"
        >
          Code
        </th>
        <th
          className="px-6 py-3 text-left text-sm font-medium text-slate-900"
          scope="col"
        >
          Company
        </th>
        <th
          className="px-6 py-3 text-left text-sm font-medium text-slate-900"
          scope="col"
        >
          Price HT
        </th>
        <th
          className="px-6 py-3 text-left text-sm font-medium text-slate-900"
          scope="col"
        >
          TVA
        </th>
        <th
          className="px-6 py-3 text-left text-sm font-medium text-slate-900"
          scope="col"
        >
          Status
        </th>
      </tr>
    </thead>
  );
};

const TableFooter = () => {
  return (
    <tfoot className="bg-slate-100 border-y border-slate-200">
      <tr>
        <td />
        <td />
        <td />
        <td className="px-6 py-3 text-left text-sm font-medium text-slate-900">
          Totals
        </td>
        <td>VAR%TOTAL%</td>
      </tr>
    </tfoot>
  );
};

const TableBody = () => {
  return (
    <tbody>
      {['0', '1', '2', '3', '5', '6'].map((index) => {
        return (
          <tr className="odd:bg-white even:bg-slate-50">
            <th
              scope="row"
              className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900"
            >
              {index}
            </th>
            {['SAMPLE', '50.5 €', '11€', 'PAYER'].map((val) => {
              return (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {val}
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );
};

const TableBase = () => {
  return (
    <table className="border min-w-full">
      <TableHeader />
      <TableBody />
      <TableFooter />
    </table>
  );
};

export { TableBase, TableHeader };
