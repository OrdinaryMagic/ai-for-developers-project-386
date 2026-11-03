import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MeetingType } from "@/features/guest/api";

export function MeetingTypeCard({ meetingType }: { meetingType: MeetingType }) {
  return (
    <Link
      to={`/book/${meetingType.id}`}
      data-testid={`meeting-type-card-${meetingType.id}`}
      className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg"
    >
      <Card data-testid="meeting-type-card" className="hover:bg-accent/50 transition-colors">
        <CardHeader>
          <CardTitle>{meetingType.name}</CardTitle>
          <CardDescription>
            {meetingType.durationMinutes} {meetingType.durationMinutes === 1 ? "минута" : "минут"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-3">{meetingType.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
