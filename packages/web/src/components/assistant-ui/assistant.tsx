import makeAssistantVisible from "./make-assistant-visible";
import { Button as ButtonPrimitive } from "../ui/button";
import { Input as InputPrimitive } from "../ui/input";
import { Textarea as TextareaPrimitive } from "../ui/textarea";
import { Select as SelectPrimitive } from "../ui/select";  
import { Label as LabelPrimitive } from "../ui/label";
import { Switch as SwitchPrimitive } from "../ui/switch";
import { Accordion as AccordionPrimitive } from "../ui/accordion";
import { Table as TablePrimitive } from "../ui/table";
import { Tooltip as TooltipPrimitive } from "../ui/tooltip";
import { TooltipContent as TooltipContentPrimitive } from "../ui/tooltip";
import { TooltipProvider as TooltipProviderPrimitive } from "../ui/tooltip";
import { TooltipTrigger as TooltipTriggerPrimitive } from "../ui/tooltip";

export const Button = makeAssistantVisible(ButtonPrimitive, { clickable: true });

export const Input = makeAssistantVisible(InputPrimitive, { editable: true });

export const Textarea = makeAssistantVisible(TextareaPrimitive, { editable: true });

export const Select = makeAssistantVisible(SelectPrimitive, { editable: true });

export const Label = makeAssistantVisible(LabelPrimitive);

export const Switch = makeAssistantVisible(SwitchPrimitive, { clickable: true });

export const Accordion = makeAssistantVisible(AccordionPrimitive, { clickable: true });

export const Table = makeAssistantVisible(TablePrimitive);

export const Tooltip = makeAssistantVisible(TooltipPrimitive);

export const TooltipContent = makeAssistantVisible(TooltipContentPrimitive);

export const TooltipProvider = makeAssistantVisible(TooltipProviderPrimitive);

export const TooltipTrigger = makeAssistantVisible(TooltipTriggerPrimitive);