import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Calendar from "react-calendar";
import { format, isSameDay, parseISO, startOfWeek, endOfWeek, addDays, startOfDay, addHours } from "date-fns";
import { Plus, Eye, Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  startTime: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  priority: z.number().min(1).max(5).optional().default(1),
  teamId: z.string().min(1, "Team is required"),
});

type EventFormData = z.infer<typeof eventFormSchema>;

interface CalendarPageProps {
  teamId: string;
}

// Generate time options (30-minute intervals, exclude 24:30)
const generateTimeOptions = () => {
  const times: string[] = [];
  for (let hour = 0; hour <= 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 24 && minute > 0) break; // Exclude 24:30
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      times.push(timeString);
    }
  }
  return times;
};

const timeOptions = generateTimeOptions();

export default function CalendarPage({ teamId }: CalendarPageProps) {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: [`/api/calendar/${teamId}`],
  });

  // Get next priority based on existing events
  const getNextPriority = () => {
    if (events.length === 0) return 1;
    const maxPriority = Math.max(...events.map(e => e.priority || 1));
    return Math.min(maxPriority + 1, 5); // Cap at 5
  };

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: "",
      startTime: "",
      endTime: "",
      priority: getNextPriority(),
      teamId: teamId,
    },
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
      form.reset({
        title: "",
        description: "",
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: "",
        startTime: "",
        endTime: "",
        priority: getNextPriority(),
        teamId: teamId,
      });
    },
  });

  const onSubmit = (data: EventFormData) => {
    // Convert date strings to Date objects
    const startDateTime = new Date(data.startDate);
    
    // If startTime is provided, set the time; otherwise default to 9 AM
    if (data.startTime) {
      const [hours, minutes] = data.startTime.split(':').map(Number);
      startDateTime.setHours(hours, minutes, 0, 0);
    } else {
      startDateTime.setHours(9, 0, 0, 0);
    }
    
    let endDateTime: Date | null = null;
    if (data.endDate && data.endDate.trim() !== "") {
      endDateTime = new Date(data.endDate);
      if (data.endTime) {
        const [hours, minutes] = data.endTime.split(':').map(Number);
        endDateTime.setHours(hours, minutes, 0, 0);
      } else {
        endDateTime.setHours(18, 0, 0, 0);
      }
    }

    const eventData = {
      title: data.title,
      description: data.description || null,
      startDate: startDateTime,
      endDate: endDateTime,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      priority: data.priority || getNextPriority(),
      teamId: data.teamId,
      linkedPageId: null,
    };

    console.log("Sending event data:", eventData);
    createEventMutation.mutate(eventData);
  };

  const getEventsForDate = (date: Date) => {
    return events
      .filter(event => isSameDay(new Date(event.startDate), date))
      .sort((a, b) => {
        const priorityA = a.priority ?? 1; // Use nullish coalescing
        const priorityB = b.priority ?? 1;
        return priorityA - priorityB;
      });
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
                  className={`w-2 h-2 rounded-full ${getPriorityColor(event.priority)}`}
                  title={`${event.title} (Priority ${event.priority ?? 1})`}
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

  // Get priority color
  const getPriorityColor = (priority?: number | null) => {
    const p = priority || 1; // Default to 1 if undefined/null
    switch (p) {
      case 1: return "bg-red-500"; // Highest priority
      case 2: return "bg-orange-500";
      case 3: return "bg-yellow-500";
      case 4: return "bg-blue-500";
      case 5: return "bg-green-500"; // Lowest priority
      default: return "bg-blue-500";
    }
  };

  // Format event time display
  const formatEventTime = (event: CalendarEvent) => {
    if (!event.startTime || event.startTime === null) return "All day";
    
    let timeStr = event.startTime;
    if (event.endTime && event.endTime !== null) {
      timeStr += ` - ${event.endTime}`;
    }
    return timeStr;
  };

  // Navigation functions
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = selectedDate;
    let newDate: Date;
    
    switch (viewMode) {
      case 'day':
        newDate = addDays(currentDate, direction === 'next' ? 1 : -1);
        break;
      case 'week':
        newDate = addDays(currentDate, direction === 'next' ? 7 : -7);
        break;
      case 'month':
        newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + (direction === 'next' ? 1 : -1), 1);
        break;
      default:
        newDate = currentDate;
    }
    
    setSelectedDate(newDate);
  };

  // Get title for current view
  const getViewTitle = () => {
    switch (viewMode) {
      case 'day':
        return format(selectedDate, "EEEE, MMMM d, yyyy");
      case 'week':
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
      case 'month':
        return format(selectedDate, "MMMM yyyy");
      default:
        return format(selectedDate, "MMMM yyyy");
    }
  };

  // Render Week View
  const renderWeekView = () => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    
    return (
      <div className="space-y-4">
        {/* Week header */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => (
            <div key={day.toISOString()} className="text-center">
              <div className="font-medium text-slate-900 dark:text-white">
                {format(day, "EEE")}
              </div>
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
        
        {/* Week content */}
        <div className="grid grid-cols-7 gap-2 min-h-[300px]">
          {days.map((day) => {
            const dayEvents = getEventsForDate(day);
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDate);
            
            return (
              <div 
                key={day.toISOString()}
                className={`p-2 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                  isToday ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' : ''
                } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => setSelectedDate(day)}
              >
                <div className="space-y-1">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`text-xs p-1 text-white rounded truncate ${getPriorityColor(event.priority)}`}
                      title={`${event.title} (${formatEventTime(event)}) [P${event.priority ?? 1}]`}
                    >
                      [P{event.priority ?? 1}] {event.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render Day View
  const renderDayView = () => {
    const dayEvents = getEventsForDate(selectedDate);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    
    return (
      <div className="space-y-4">
        {/* All day events */}
        {dayEvents.filter(e => !e.startTime || e.startTime === null).length > 0 && (
          <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
            <h3 className="font-medium mb-2">All Day Events</h3>
            <div className="space-y-1">
                             {dayEvents.filter(e => !e.startTime || e.startTime === null).map((event) => (
                <div
                  key={event.id}
                  className={`p-2 text-white rounded text-sm ${getPriorityColor(event.priority || 1)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">[P{event.priority || 1}] {event.title}</div>
                  </div>
                  {event.description && (
                    <div className="text-xs opacity-90">{event.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Time slots */}
        <div className="grid grid-cols-1 gap-1">
          {hours.map((hour) => {
            const hourEvents = dayEvents.filter(event => {
              if (!event.startTime || event.startTime === null) return false;
              try {
                const eventHour = parseInt(event.startTime.split(':')[0]);
                return eventHour === hour;
              } catch {
                return false; // Handle any parsing errors
              }
            });
            
            return (
              <div 
                key={hour}
                className="flex border-b border-slate-200 dark:border-slate-700 py-2"
              >
                <div className="w-20 text-sm text-slate-500 dark:text-slate-400 pr-4">
                  {format(addHours(startOfDay(selectedDate), hour), "h:mm a")}
                </div>
                <div className="flex-1 space-y-1">
                  {hourEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`p-2 text-white rounded text-sm ${getPriorityColor(event.priority || 1)}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">[P{event.priority || 1}] {event.title}</div>
                        <div className="text-xs opacity-90">{formatEventTime(event)}</div>
                      </div>
                      {event.description && (
                        <div className="text-xs opacity-90">{event.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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
              <Button
                variant={viewMode === "day" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("day")}
              >
                Day
              </Button>
            </div>
            <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Event
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
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
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
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
                            <FormLabel>End Date (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="All day" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[200px]">
                                <SelectItem value="">All day</SelectItem>
                                {timeOptions.map((time) => (
                                  <SelectItem key={time} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="All day" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[200px]">
                                <SelectItem value="">All day</SelectItem>
                                {timeOptions.map((time) => (
                                  <SelectItem key={time} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">1 - Highest Priority</SelectItem>
                              <SelectItem value="2">2 - High Priority</SelectItem>
                              <SelectItem value="3">3 - Medium Priority</SelectItem>
                              <SelectItem value="4">4 - Low Priority</SelectItem>
                              <SelectItem value="5">5 - Lowest Priority</SelectItem>
                            </SelectContent>
                          </Select>
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

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {getViewTitle()}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CalendarIcon className="h-5 w-5 mr-2" />
                  {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} View
                </CardTitle>
              </CardHeader>
              <CardContent>
                {viewMode === "month" && (
                  <Calendar
                    onChange={(date) => setSelectedDate(date as Date)}
                    value={selectedDate}
                    tileContent={getTileContent}
                    className="w-full border-none"
                  />
                )}
                {viewMode === "week" && renderWeekView()}
                {viewMode === "day" && renderDayView()}
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
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${getPriorityColor(event.priority || 1)} text-white border-none`}>
                              P{event.priority || 1}
                            </Badge>
                            <h4 className="font-medium text-slate-900 dark:text-white">
                              {event.title}
                            </h4>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {format(new Date(event.startDate), "MMM d, yyyy")}
                            {event.endDate && ` - ${format(new Date(event.endDate), "MMM d, yyyy")}`}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {formatEventTime(event)}
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
                  .sort((a, b) => (a.priority || 1) - (b.priority || 1))
                  .slice(0, 5)
                  .map(event => (
                    <div key={event.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${getPriorityColor(event.priority || 1)} text-white border-none`}>
                            P{event.priority || 1}
                          </Badge>
                          <p className="font-medium text-sm">{event.title}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {format(new Date(event.startDate), "MMM d")} - {formatEventTime(event)}
                        </p>
                      </div>
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