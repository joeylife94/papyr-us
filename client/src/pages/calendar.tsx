import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Calendar from "react-calendar";
import { format, isSameDay, parseISO } from "date-fns";
import { Plus, Eye, Calendar as CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { CalendarEvent, InsertCalendarEvent } from "@shared/schema";
import "react-calendar/dist/Calendar.css";

const eventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  teamId: z.string().min(1, "Team is required"),
});

type EventFormData = z.infer<typeof eventFormSchema>;

interface CalendarPageProps {
  teamId: string;
}

export default function CalendarPage({ teamId }: CalendarPageProps) {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      startDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      endDate: "",
      teamId: teamId,
    },
  });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: [`/api/calendar/${teamId}`],
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: InsertCalendarEvent) => {
      const response = await fetch(`/api/calendar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create event");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/calendar/${teamId}`] });
      setIsEventDialogOpen(false);
      form.reset();
    },
  });

  const onSubmit = (data: EventFormData) => {
    createEventMutation.mutate({
      ...data,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    });
  };

  const getEventsForDate = (date: Date) => {
    return events.filter(event => 
      isSameDay(new Date(event.startDate), date)
    );
  };

  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === "month") {
      const dayEvents = getEventsForDate(date);
      if (dayEvents.length > 0) {
        return (
          <div className="flex flex-wrap gap-1 mt-1">
            {dayEvents.slice(0, 2).map(event => (
              <div
                key={event.id}
                className="w-2 h-2 bg-blue-500 rounded-full"
                title={event.title}
              />
            ))}
            {dayEvents.length > 2 && (
              <div className="text-xs text-slate-500">
                +{dayEvents.length - 2}
              </div>
            )}
          </div>
        );
      }
    }
    return null;
  };

  const selectedDateEvents = getEventsForDate(selectedDate);
  const teamName = teamId === "team1" ? "Team Alpha" : teamId === "team2" ? "Team Beta" : teamId;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            {teamName} Calendar
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Manage your team's schedule and deadlines
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Button
              variant={viewMode === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("month")}
            >
              Month
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("week")}
            >
              Week
            </Button>
          </div>
          <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create New Event</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Meeting, deadline, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Event details..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date & Time</FormLabel>
                        <FormControl>
                          <Input 
                            type="datetime-local" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date & Time (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="datetime-local" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsEventDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createEventMutation.isPending}
                    >
                      {createEventMutation.isPending ? "Creating..." : "Create Event"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CalendarIcon className="h-5 w-5 mr-2" />
                {format(selectedDate, "MMMM yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                onChange={(date) => setSelectedDate(date as Date)}
                value={selectedDate}
                tileContent={getTileContent}
                className="w-full border-none"
              />
            </CardContent>
          </Card>
        </div>

        {/* Events for Selected Date */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                {format(selectedDate, "MMMM d, yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedDateEvents.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  No events scheduled for this date
                </p>
              ) : (
                selectedDateEvents.map(event => (
                  <div
                    key={event.id}
                    className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900 dark:text-white">
                          {event.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {format(new Date(event.startDate), "h:mm a")}
                          {event.endDate && ` - ${format(new Date(event.endDate), "h:mm a")}`}
                        </p>
                        {event.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                            {event.description}
                          </p>
                        )}
                      </div>
                      {event.linkedPageId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/papyr-us/page/${event.linkedPageId}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events
                .filter(event => new Date(event.startDate) > new Date())
                .slice(0, 5)
                .map(event => (
                  <div key={event.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                    <div>
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(event.startDate), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(event.startDate), "MMM d")}
                    </Badge>
                  </div>
                ))}
              {events.filter(event => new Date(event.startDate) > new Date()).length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No upcoming events
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}