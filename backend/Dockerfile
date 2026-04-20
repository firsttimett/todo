FROM python:3.12.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv==0.7.12

COPY backend/ .

RUN uv pip install --system .

# Non-root user
RUN addgroup --system app && adduser --system --ingroup app app
USER app

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
