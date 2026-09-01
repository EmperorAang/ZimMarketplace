using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZimMarketplace.API.Migrations
{
    /// <inheritdoc />
    public partial class SyncEndTimeAndSoldStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "EndTime",
                table: "Listings",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EndTime",
                table: "Listings");
        }
    }
}
