import { ReactNode } from "react";
import CardMUI from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";

interface CardProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Card({ title, children, footer }: CardProps) {
  return (
    <CardMUI variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {children}
        </Typography>
      </CardContent>
      {footer ? <CardActions>{footer}</CardActions> : null}
    </CardMUI>
  );
}
