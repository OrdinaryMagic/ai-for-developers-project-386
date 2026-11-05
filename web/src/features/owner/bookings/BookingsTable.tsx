import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/dateTime";
import { useOwnerTimezone } from "./OwnerTimezoneContext";
import type { Booking } from "./api";

interface BookingsTableProps {
  bookings: Booking[];
}

export function BookingsTable({ bookings }: BookingsTableProps) {
  const { timezone } = useOwnerTimezone();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead data-testid="bookings-table-head-meeting-type">Тип встречи</TableHead>
          <TableHead data-testid="bookings-table-head-guest-name">Гость</TableHead>
          <TableHead data-testid="bookings-table-head-guest-email">Email</TableHead>
          <TableHead data-testid="bookings-table-head-starts-at">Начало</TableHead>
          <TableHead data-testid="bookings-table-head-ends-at">Окончание</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody data-testid="bookings-table">
        {bookings.map((b) => (
          <TableRow key={b.id} data-testid="booking-row">
            <TableCell data-testid="booking-row-meeting-type">{b.meetingTypeName}</TableCell>
            <TableCell data-testid="booking-row-guest-name">{b.guestName}</TableCell>
            <TableCell data-testid="booking-row-guest-email">{b.guestEmail}</TableCell>
            <TableCell data-testid="booking-row-starts-at">
              {formatDateTime(b.startsAt, timezone)}
            </TableCell>
            <TableCell data-testid="booking-row-ends-at">
              {formatDateTime(b.endsAt, timezone)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
