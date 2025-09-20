import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Calendar from "react-calendar";
import { format, isSameDay, parseISO, startOfWeek, endOfWeek, addDays, startOfDay, addHours } from "date-fns";
import { Plus, Eye, Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Edit, Trash2, Calendar as CalendarSmall } from "lucide-react";
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
import React from "react";

const eventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  priority: z.number().min(1).max(5).default(1),
  teamId: z.string().min(1, "Team is required"),
});

type EventFormData = z.infer<typeof eventFormSchema>;

interface CalendarPageProps {
  teamId?: string;
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

// Generate filtered end time options based on start time
const generateEndTimeOptions = (startTime?: string) => {
  const allTimes = generateTimeOptions();
  if (!startTime) return allTimes;
  
  const startIndex = allTimes.indexOf(startTime);
  if (startIndex === -1) return allTimes;
  
  // Return times after the start time (at least 30 minutes later)
  return allTimes.slice(startIndex + 1);
};

const timeOptions = generateTimeOptions();

export default function CalendarPage({ teamId }: CalendarPageProps) {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: [`/papyr-us/api/calendar/${String(teamId || '')}`],
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
      startTime: undefined,
      endTime: undefined,
      priority: getNextPriority(),
  teamId: String(teamId || ''),
    },
  });

  // Watch start time to filter end time options
  const watchedStartTime = form.watch("startTime");
  const endTimeOptions = generateEndTimeOptions(watchedStartTime);

  // Reset end time when start time changes
  React.useEffect(() => {
    const currentEndTime = form.getValues("endTime");
    if (watchedStartTime && currentEndTime) {
      const startIndex = timeOptions.indexOf(watchedStartTime);
      const endIndex = timeOptions.indexOf(currentEndTime);
      
      // If end time is not after start time, reset it
      if (endIndex <= startIndex) {
        form.setValue("endTime", undefined);
      }
    }
  }, [watchedStartTime, form]);

  const createEventMutation = useMutation({
    mutationFn: async (data: InsertCalendarEvent) => {
      const response = await fetch(`/papyr-us/api/calendar`, {
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
      queryClient.invalidateQueries({ queryKey: [`/papyr-us/api/calendar/${teamId}`] });
      handleCloseDialog();
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertCalendarEvent> }) => {
      const response = await fetch(`/papyr-us/api/calendar/event/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update event");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/papyr-us/api/calendar/${teamId}`] });
      handleCloseDialog();
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/papyr-us/api/calendar/event/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete event");
      return response.ok;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/papyr-us/api/calendar/${teamId}`] });
      handleCloseDialog();
    },
  });

  const handleCloseDialog = () => {
    setIsEventDialogOpen(false);
    setEditingEvent(null);
    setIsEditing(false);
    form.reset({
      title: "",
      description: "",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: "",
      startTime: undefined,
      endTime: undefined,
      priority: getNextPriority(),
      teamId: teamId,
    });
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setIsEditing(true);
    setIsEventDialogOpen(true);
    
    // Populate form with existing event data
    form.reset({
      title: event.title,
      description: event.description || "",
      startDate: format(new Date(event.startDate), "yyyy-MM-dd"),
      endDate: event.endDate ? format(new Date(event.endDate), "yyyy-MM-dd") : "",
      startTime: event.startTime || undefined,
      endTime: event.endTime || undefined,
      priority: event.priority || 1,
      teamId: event.teamId,
    });
  };

  const handleDeleteEvent = () => {
    if (editingEvent && window.confirm("Are you sure you want to delete this event?")) {
      deleteEventMutation.mutate(editingEvent.id);
    }
  };

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

    if (isEditing && editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, data: eventData });
    } else {
      createEventMutation.mutate(eventData);
    }
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
                className={`w-3 h-3 rounded-full cursor-pointer hover:scale-125 transition-all duration-200 border border-white/30 hover:border-white/60 ${getPriorityColor(event.priority)}`}
                title={`Click to edit: ${event.title} (Priority ${event.priority ?? 1})`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditEvent(event);
                }}
              />
            ))}
            {dayEvents.length > 2 && (
              <div className="text-xs text-slate-500 font-medium">
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
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day, index) => {
            const dayEvents = getEventsForDate(day);
            return (
              <div key={index} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 min-h-[120px]">
                <div className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                  {format(day, "EEE d")}
                </div>
                <div className="space-y-1">
                  {dayEvents.map(event => (
                    <div
                      key={event.id}
                      className={`p-2 rounded text-xs text-white cursor-pointer hover:opacity-80 hover:scale-105 transition-all duration-200 border border-transparent hover:border-white/30 ${getPriorityColor(event.priority)}`}
                      title={`Click to edit: ${event.title} (Priority ${event.priority ?? 1})`}
                      onClick={() => handleEditEvent(event)}
                    >
                      <div className="font-medium truncate flex items-center justify-between">
                        <span>{event.title}</span>
                        <Edit className="h-2.5 w-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-xs opacity-90">{formatEventTime(event)}</div>
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

  const renderDayView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayEvents = getEventsForDate(selectedDate);
    
    // Separate all-day events from timed events
    const allDayEvents = dayEvents.filter(event => !event.startTime || event.startTime === null);
    const timedEvents = dayEvents.filter(event => event.startTime && event.startTime !== null);

    return (
      <div className="space-y-4">
        {/* All Day Events Section */}
        {allDayEvents.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <h3 className="font-medium text-slate-900 dark:text-white mb-3 flex items-center">
              <CalendarSmall className="h-4 w-4 mr-2" />
              All Day Events
            </h3>
            <div className="space-y-2">
              {allDayEvents.map(event => (
                <div
                  key={event.id}
                  className={`p-3 rounded text-white cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg group ${getPriorityColor(event.priority)}`}
                  title={`Click to edit: ${event.title} (Priority ${event.priority ?? 1})`}
                  onClick={() => handleEditEvent(event)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{event.title}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-90">P{event.priority || 1}</span>
                      <Edit className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  {event.description && (
                    <div className="text-sm opacity-90 mt-1">{event.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timed Events Section */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-medium text-slate-900 dark:text-white flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Schedule
            </h3>
          </div>
          {hours.map(hour => (
            <div key={hour} className="flex border-b border-slate-100 dark:border-slate-800 last:border-b-0">
              <div className="w-16 p-2 text-sm text-slate-600 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1 p-2 min-h-[60px] relative">
                {timedEvents
                  .filter(event => {
                    if (!event.startTime) return false; // These are handled in all-day section
                    const eventHour = parseInt(event.startTime.split(':')[0]);
                    return eventHour === hour;
                  })
                  .map(event => (
                    <div
                      key={event.id}
                      className={`absolute left-2 right-2 p-3 rounded text-white cursor-pointer hover:opacity-90 hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg group ${getPriorityColor(event.priority)}`}
                      title={`Click to edit: ${event.title} (Priority ${event.priority ?? 1})`}
                      onClick={() => handleEditEvent(event)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{event.title}</div>
                        <Edit className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-sm opacity-90">{formatEventTime(event)}</div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
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
                  <DialogTitle>{isEditing ? "Edit Event" : "Create New Event"}</DialogTitle>
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
                            <Select onValueChange={(value) => field.onChange(value || undefined)} value={field.value || undefined}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="All day" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[200px]">
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
                            <Select onValueChange={(value) => field.onChange(value || undefined)} value={field.value || undefined}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={watchedStartTime ? "Select end time" : "All day"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[200px]">
                                {endTimeOptions.map((time) => (
                                  <SelectItem key={time} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {watchedStartTime && endTimeOptions.length === 0 && (
                              <p className="text-sm text-red-500">No available end times. Please select an earlier start time.</p>
                            )}
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
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString() || "1"}>
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
                        onClick={handleCloseDialog}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createEventMutation.isPending || updateEventMutation.isPending}
                      >
                        {createEventMutation.isPending || updateEventMutation.isPending ? "Saving..." : "Save Event"}
                      </Button>
                      {isEditing && editingEvent && (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleDeleteEvent}
                          disabled={deleteEventMutation.isPending}
                        >
                          {deleteEventMutation.isPending ? "Deleting..." : "Delete Event"}
                        </Button>
                      )}
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
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 ml-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditEvent(event)}
                            className="h-7 px-2"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
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